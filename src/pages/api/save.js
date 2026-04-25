import { supabase } from '../../lib/supabase.js'
import { Resend } from 'resend'

const resend = new Resend(import.meta.env.RESEND_API_KEY)
const PERIODE = 'fev-paques-2026'
const MON_MAIL = 'ton@mail.com'

export async function POST({ request }) {
  const { token, pointages } = await request.json()

  const { data: prof, error } = await supabase
    .from('profs')
    .select('id, nom, prenom, mail, valid_form')
    .eq('token', token)
    .single()

  if (error || !prof) {
    return new Response(JSON.stringify({ error: 'Prof introuvable' }), { status: 404 })
  }

  if (prof.valid_form) {
    return new Response(JSON.stringify({ error: 'Formulaire déjà validé' }), { status: 403 })
  }

  // Upsert de tous les pointages
  const rows = pointages.map(p => ({
    prof_id: prof.id,
    periode: PERIODE,
    date: p.date,
    session: p.session,
    statut: p.statut,
    updated_at: new Date().toISOString()
  }))

  const { error: upsertError } = await supabase
    .from('pointages')
    .upsert(rows, { onConflict: 'prof_id,periode,date,session' })

  if (upsertError) {
    return new Response(JSON.stringify({ error: 'Erreur sauvegarde' }), { status: 500 })
  }

  // Marquer comme validé
  await supabase.from('profs').update({ valid_form: true }).eq('id', prof.id)

  // Résumé pour le mail
  const presents = pointages.filter(p => p.statut === 'present').length
  const absents = pointages.filter(p => p.statut === 'absent').length
  const remplacements = pointages.filter(p => p.statut === 'remplacement').length

  const lignes = pointages
    .filter(p => p.statut !== 'non_assigne')
    .map(p => `${p.date} — ${p.session === 'matin' ? 'Matin' : 'Après-midi'} : ${p.statut}`)
    .join('\n')

  const corps = `
${prof.prenom} ${prof.nom} a validé son pointage pour la période ${PERIODE}.

Présences : ${presents}
Absences : ${absents}
Remplacements : ${remplacements}

Détail :
${lignes}
  `.trim()

  await resend.emails.send({
    from: 'ecole@tondomaine.com',
    to: [prof.mail, MON_MAIL],
    subject: `Pointage ${prof.prenom} ${prof.nom} — ${PERIODE}`,
    text: corps
  })

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
