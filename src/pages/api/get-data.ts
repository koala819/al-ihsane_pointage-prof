import type { APIContext } from 'astro'
import { supabase } from '../../lib/supabase.js'

export async function GET({ request }: APIContext): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  if (!token || token.length < 10) {
  return new Response(
    JSON.stringify({ error: 'Token invalide' }),
    { status: 400 }
  )
}

  const { data: prof, error } = await supabase
    .from('paie.profs')
    .select('id, nom, prenom, niveau, salaire, mail, valid_form')
    .eq('token', token)
    .single()

  if (error || !prof) {
    return new Response(JSON.stringify({ error: 'Prof introuvable' }), { status: 404 })
  }

  const { data: periode, error: periodeError } = await supabase
    .from('paie.periodes')
    .select('id, nom, date_debut, date_fin')
    .eq('actif', true)
    .maybeSingle()

  if (periodeError || !periode) {
    return new Response(JSON.stringify({ error: 'Période introuvable' }), { status: 404 })
  }

  const { data: pointages, error: pointagesError } = await supabase
    .from('paie.pointages')
    .select('date, session, statut')
    .eq('prof_id', prof.id)
    .eq('periode_id', periode.id)
    .order('date', { ascending: true })

  if (pointagesError) {
    return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des pointages' }), { status: 500 })
  }

  return new Response(JSON.stringify({
  prof,
  periode,
  pointages,
  hasSubmitted: prof.valid_form,
  hasPointages: pointages.length > 0,
  fullName: `${prof.prenom} ${prof.nom}`
}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
