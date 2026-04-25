import { supabase } from '../../lib/supabase.js'
import { Resend } from 'resend'

const resend = new Resend(import.meta.env.RESEND_API_KEY)
const MON_MAIL = 'ton@mail.com'
const statutsAutorises = ['present', 'absent', 'remplacement', 'non_assigne']
const sessionsAutorisees = ['matin', 'apres_midi']

export async function POST({ request }) {
  const { token, pointages } = await request.json()

  if (!token || !Array.isArray(pointages)) {
    return new Response(JSON.stringify({ error: 'Payload invalide' }), { status: 400 })
  }

  //Validation des données métier
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

    if (isNaN(new Date(p.date))) {
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
    return new Response(JSON.stringify({ error: 'Période introuvable' }), { status: 404 })
  }

  if (prof.valid_form) {
    return new Response(JSON.stringify({ error: 'Formulaire déjà validé' }), { status: 403 })
  }

  // Upsert de tous les pointages
  const rows = pointages.map(p => ({
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

  // Marquer comme validé
  const { error: updateError } = await supabase.from('paie.profs').update({ valid_form: true }).eq('id', prof.id)

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Erreur mise à jour avant envoi du mail erreur: ' + updateError.message }), { status: 500 })
  }

  // Résumé pour le mail
  const presents = pointages.filter(p => p.statut === 'present').length
  const absents = pointages.filter(p => p.statut === 'absent').length
  const remplacements = pointages.filter(p => p.statut === 'remplacement').length

  const lignes = pointages
    .filter(p => p.statut !== 'non_assigne')
    .map(p => `${p.date} — ${p.session === 'matin' ? 'Matin' : 'Après-midi'} : ${p.statut}`)
    .join('\n')

  const corps = `
${prof.prenom} ${prof.nom} a validé son pointage pour la période ${periode.nom}.

Présences : ${presents}
Absences : ${absents}
Remplacements : ${remplacements}

Détail :
${lignes}
  `.trim()

  try {
    await resend.emails.send({
      from: 'ecole@tondomaine.com',
      to: [prof.mail, MON_MAIL],
      subject: `Pointage ${prof.prenom} ${prof.nom} — ${periode.nom}`,
      text: corps
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erreur envoi mail:' + error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
