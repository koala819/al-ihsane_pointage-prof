import type { APIContext } from 'astro'
import { supabaseServer } from '../../lib/supabase-server'
import { loadPeriodeActive, loadProfByToken } from './get'
import nodemailer from 'nodemailer'
import type { SavePayload, Session, Statut } from '../../lib/types'

export const prerender = false

const MAIL_TO = import.meta.env.MAIL_TO
const SMTP_HOST = import.meta.env.SMTP_HOST
const SMTP_PORT = Number.parseInt(import.meta.env.SMTP_PORT, 10)
const SMTP_USER = import.meta.env.SMTP_USER
const SMTP_PASSWORD = import.meta.env.SMTP_PASSWORD
const statutsAutorises: Statut[] = ['present', 'absent', 'remplacement', 'non_assigne']
const sessionsAutorisees: Session[] = ['matin', 'apres_midi']

function toDbSession(session: Session): 'matin' | 'apm' {
  return session === 'apres_midi' ? 'apm' : session
}

function isValidDate(dateStr: string): boolean {
  return !Number.isNaN(new Date(dateStr).getTime())
}

function toDisplayStatut(statut: Statut): string {
  if (statut === 'present') return 'Present'
  if (statut === 'absent') return 'Absent'
  if (statut === 'remplacement') return 'Remplacement'
  return 'Non assigne'
}

function statusColor(statut: Statut): string {
  if (statut === 'present') return '#0F6E56'
  if (statut === 'absent') return '#A32D2D'
  if (statut === 'remplacement') return '#854F0B'
  return '#5F5A50'
}

function toFrenchDayName(dateStr: string): 'Samedi' | 'Dimanche' | 'Jour' {
  const d = new Date(`${dateStr}T00:00:00`)
  const day = d.getDay()
  if (day === 6) return 'Samedi'
  if (day === 0) return 'Dimanche'
  return 'Jour'
}

function mondayKey(dateStr: string): string {
  const dt = new Date(`${dateStr}T00:00:00`)
  const monday = new Date(dt)
  monday.setDate(dt.getDate() - (dt.getDay() === 0 ? 6 : dt.getDay() - 1))
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatFrenchDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

export async function POST({ request }: APIContext): Promise<Response> {
  let payload: SavePayload
  try {
    payload = (await request.json()) as SavePayload
  } catch {
    return new Response(JSON.stringify({ error: 'Payload JSON invalide' }), { status: 400 })
  }

  const { token, pointages } = payload

  if (!token || !Array.isArray(pointages)) {
    return new Response(JSON.stringify({ error: 'Payload invalide' }), { status: 400 })
  }

  if (pointages.length === 0) {
    return new Response(JSON.stringify({ error: 'Aucun pointage' }), { status: 400 })
  }

  for (const p of pointages) {
    if (!statutsAutorises.includes(p.statut)) {
      return new Response(JSON.stringify({ error: 'Statut invalide' }), { status: 400 })
    }
    if (!sessionsAutorisees.includes(p.session)) {
      return new Response(JSON.stringify({ error: 'Session invalide' }), { status: 400 })
    }
    if (!isValidDate(p.date)) {
      return new Response(JSON.stringify({ error: 'Date invalide' }), { status: 400 })
    }
  }

  const { data: prof, error } = await loadProfByToken(token)

  if (error || !prof) {
    return new Response(JSON.stringify({ error: 'Prof introuvable' }), { status: 404 })
  }

  const { data: periode, error: periodeError } = await loadPeriodeActive()

  if (periodeError || !periode) {
    return new Response(JSON.stringify({ error: 'Periode introuvable' }), { status: 404 })
  }

  if (prof.valid_form) {
    return new Response(JSON.stringify({ error: 'Formulaire deja valide' }), { status: 403 })
  }

  const rows = pointages.map((p) => ({
    prof_id: prof.id,
    periode_id: periode.id,
    date: p.date,
    session: toDbSession(p.session),
    statut: p.statut,
    updated_at: new Date().toISOString()
  }))

  /* Sauvegarder les pointages : cle unique prof_id, periode_id, date, session */
  const { error: upsertError } = await supabaseServer
    .schema('paie')
    .from('pointages')
    .upsert(rows, { onConflict: 'prof_id,periode_id,date,session' })

  if (upsertError) {
    return new Response(
      JSON.stringify({
        error: 'Erreur sauvegarde',
        details: upsertError.message,
        hint: upsertError.hint ?? undefined,
        code: upsertError.code ?? undefined
      }),
      { status: 500 }
    )
  }

  const coursPayants = pointages.filter(
    (p) => p.statut === 'present' || p.statut === 'remplacement'
  ).length

  /* Mettre à jour les données du prof : valid_form */
  const { error: updateError } = await supabaseServer
    .schema('paie')
    .from('profs')
    .update({ valid_form: true })
    .eq('id', prof.id)

  if (updateError) {
    return new Response(
      JSON.stringify({ error: `Erreur mise a jour avant envoi du mail erreur: ${updateError.message}` }),
      { status: 500 }
    )
  }

  const presents = pointages.filter((p) => p.statut === 'present').length
  const absents = pointages.filter((p) => p.statut === 'absent').length
  const remplacements = pointages.filter((p) => p.statut === 'remplacement').length

  const totalPayable = coursPayants

  const byDate = new Map<string, { matin?: Statut; apres_midi?: Statut }>()
  for (const p of pointages) {
    const existing = byDate.get(p.date) ?? {}
    const key = p.session === 'matin' ? 'matin' : 'apres_midi'
    existing[key] = p.statut
    byDate.set(p.date, existing)
  }

  const datesSorted = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b))
  const weekMap = new Map<string, string[]>()
  for (const date of datesSorted) {
    const sessions = byDate.get(date) ?? {}
    const dayName = toFrenchDayName(date)
    const matinStatut = sessions.matin ?? 'non_assigne'
    const apmStatut = sessions.apres_midi ?? 'non_assigne'
    const detailParts: string[] = []
    if (matinStatut !== 'non_assigne') {
      detailParts.push(
        `Matin: <span style="color:${statusColor(matinStatut)}">${toDisplayStatut(matinStatut)}</span>`
      )
    }
    if (apmStatut !== 'non_assigne') {
      detailParts.push(
        `Apres-midi: <span style="color:${statusColor(apmStatut)}">${toDisplayStatut(apmStatut)}</span>`
      )
    }
    if (detailParts.length === 0) continue

    const line = `<li><strong>${dayName} ${formatFrenchDate(date)}</strong><br/>${detailParts.join('<br/>')}</li>`
    const key = mondayKey(date)
    const arr = weekMap.get(key) ?? []
    arr.push(line)
    weekMap.set(key, arr)
  }

  const mailText = `
${prof.prenom} ${prof.nom} a valide son pointage pour la periode ${periode.nom}.

Presences: ${presents}
Absences: ${absents}
Remplacements: ${remplacements}
Total (Presences + Remplacements): ${totalPayable}

Details:
${datesSorted
  .map((date) => {
    const sessions = byDate.get(date) ?? {}
    const dayName = toFrenchDayName(date)
    const matin = toDisplayStatut(sessions.matin ?? 'non_assigne')
    const apm = toDisplayStatut(sessions.apres_midi ?? 'non_assigne')
    return `${dayName} ${formatFrenchDate(date)} - Matin: ${matin} - Apres-midi: ${apm}`
  })
  .join('\n')}
  `.trim()

  const weekBlocksHtml = Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, lines]) => `<p><strong>Semaine du ${formatFrenchDate(weekStart)}</strong></p><ul>${lines.join('')}</ul>`)
    .join('<br/>')

  const mailHtml = `
<h2>Pointage valide - ${periode.nom}</h2>
<p><strong>Prof:</strong> ${prof.prenom} ${prof.nom}</p>
<p><strong>Total (Presences + Remplacements): ${totalPayable}</strong></p>
<p>
  <span style="color:#0F6E56">Presences: ${presents}</span><br/>
  <span style="color:#854F0B">Remplacements: ${remplacements}</span><br/><br/>
  <span style="color:#A32D2D">Absences: ${absents}</span>
</p>
<hr/>
<h3>Details</h3>
${weekBlocksHtml}
  `.trim()

  if (!MAIL_TO || !SMTP_HOST || Number.isNaN(SMTP_PORT) || !SMTP_USER || !SMTP_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Configuration SMTP incomplète' }), { status: 500 })
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
      }
    })

    await transporter.sendMail({
      from: SMTP_USER,
      to: [prof.mail, MAIL_TO],
      subject: `Pointage ${prof.prenom} ${prof.nom} - ${periode.nom}`,
      text: mailText,
      html: mailHtml
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return new Response(JSON.stringify({ error: `Erreur envoi mail: ${message}` }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
