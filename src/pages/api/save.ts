import type { APIContext } from 'astro'
import { supabase } from '../../lib/supabase.js'
import { Resend } from 'resend'

type Statut = 'present' | 'absent' | 'remplacement' | 'non_assigne'
type Session = 'matin' | 'apres_midi'

type Pointage = {
  date: string
  session: Session
  statut: Statut
}

type SavePayload = {
  token?: string
  pointages?: Pointage[]
}

const resend = new Resend(import.meta.env.RESEND_API_KEY)
const MON_MAIL = 'ton@mail.com'
const statutsAutorises: Statut[] = ['present', 'absent', 'remplacement', 'non_assigne']
const sessionsAutorisees: Session[] = ['matin', 'apres_midi']

function isValidDate(dateStr: string): boolean {
  return !Number.isNaN(new Date(dateStr).getTime())
}

export async function POST({ request }: APIContext): Promise<Response> {
  const { token, pointages }: SavePayload = await request.json()

  if (!token || !Array.isArray(pointages)) {
    return new Response(JSON.stringify({ error: 'Payload invalide' }), { status: 400 })
  }

  // Validation des donnees metier
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

  const { data: prof, error } = await supabase
    .from('paie.profs')
    .select('id, nom, prenom, mail, valid_form')
    .eq('token', token)
    .maybeSingle()

  if (error || !prof) {
    return new Response(JSON.stringify({ error: 'Prof introuvable' }), { status: 404 })
  }

  const { data: periode, error: periodeError } = await supabase
    .from('paie.periodes')
    .select('id, nom')
    .eq('actif', true)
    .maybeSingle()

  if (periodeError || !periode) {
    return new Response(JSON.stringify({ error: 'Periode introuvable' }), { status: 404 })
  }

  if (prof.valid_form) {
    return new Response(JSON.stringify({ error: 'Formulaire deja valide' }), { status: 403 })
  }

  // Upsert de tous les pointages
  const rows = pointages.map((p) => ({
    prof_id: prof.id,
    periode_id: periode.id,
    date: p.date,
    session: p.session,
    statut: p.statut,
    updated_at: new Date().toISOString()
  }))

  const { error: upsertError } = await supabase
    .from('paie.pointages')
    .upsert(rows, { onConflict: 'prof_id,periode_id,date,session' })

  if (upsertError) {
    return new Response(JSON.stringify({ error: 'Erreur sauvegarde' }), { status: 500 })
  }

  // Marquer comme valide
  const { error: updateError } = await supabase
    .from('paie.profs')
    .update({ valid_form: true })
    .eq('id', prof.id)

  if (updateError) {
    return new Response(
      JSON.stringify({
        error: `Erreur mise a jour avant envoi du mail erreur: ${updateError.message}`
      }),
      { status: 500 }
    )
  }

  // Resume pour le mail
  const presents = pointages.filter((p) => p.statut === 'present').length
  const absents = pointages.filter((p) => p.statut === 'absent').length
  const remplacements = pointages.filter((p) => p.statut === 'remplacement').length

  const lignes = pointages
    .filter((p) => p.statut !== 'non_assigne')
    .map((p) => `${p.date} - ${p.session === 'matin' ? 'Matin' : 'Apres-midi'} : ${p.statut}`)
    .join('\n')

  const corps = `
${prof.prenom} ${prof.nom} a valide son pointage pour la periode ${periode.nom}.

Presences : ${presents}
Absences : ${absents}
Remplacements : ${remplacements}

Detail :
${lignes}
  `.trim()

  try {
    await resend.emails.send({
      from: 'ecole@tondomaine.com',
      to: [prof.mail, MON_MAIL],
      subject: `Pointage ${prof.prenom} ${prof.nom} - ${periode.nom}`,
      text: corps
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return new Response(JSON.stringify({ error: `Erreur envoi mail: ${message}` }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
