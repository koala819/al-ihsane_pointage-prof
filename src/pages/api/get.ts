import type { APIContext } from 'astro'
import { supabaseServer } from '../../lib/supabase-server'

export const prerender = false

function normalizeSession(session: string): 'matin' | 'apres_midi' {
  return session === 'apm' ? 'apres_midi' : 'matin'
}

export async function GET({ url }: APIContext): Promise<Response> {
  const token = url.searchParams.get('token')

  if (!token?.trim()) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 400 })
  }

  const { data: prof, error } = await supabaseServer
    .schema('paie')
    .from('profs')
    .select('id, nom, prenom, niveau, salaire, mail, valid_form')
    .eq('token', token)
    .maybeSingle()

  if (error || !prof) {
    return new Response(JSON.stringify({ error: 'Prof introuvable' }), { status: 404 })
  }

  const { data: periode, error: periodeError } = await supabaseServer
    .schema('paie')
    .from('periodes')
    .select('id, nom, date_debut, date_fin')
    .eq('actif', true)
    .maybeSingle()

  if (periodeError || !periode) {
    return new Response(JSON.stringify({ error: 'Période introuvable' }), { status: 404 })
  }

  const { data: pointages, error: pointagesError } = await supabaseServer
    .schema('paie')
    .from('pointages')
    .select('date, session, statut')
    .eq('prof_id', prof.id)
    .eq('periode', periode.id)
    .order('date', { ascending: true })

  if (pointagesError) {
    return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des pointages' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      prof,
      periode,
      pointages: pointages.map((p) => ({
        ...p,
        session: normalizeSession(p.session)
      })),
      hasSubmitted: prof.valid_form,
      hasPointages: pointages.length > 0,
      fullName: `${prof.prenom} ${prof.nom}`
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}
