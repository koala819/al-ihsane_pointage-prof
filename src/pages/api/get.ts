import type { APIContext } from 'astro'
import { supabaseServer } from '../../lib/supabase-server'

export const prerender = false

/* Retourne les données du prof par son token. */
export function loadProfByToken(token: string) {
  return supabaseServer
    .schema('paie')
    .from('profs')
    .select('id, nom, prenom, niveau, mail, valid_form')
    .eq('token', token.trim())
    .maybeSingle()
}

/* Retourne les données de la période active. */
export function loadPeriodeActive() {
  return supabaseServer
    .schema('paie')
    .from('periodes')
    .select('id, nom, date_debut, date_fin')
    .eq('actif', true)
    .maybeSingle()
}

function normalizeSession(session: string): 'matin' | 'apres_midi' {
  return session === 'apm' ? 'apres_midi' : 'matin'
}

export async function GET({ url }: APIContext): Promise<Response> {
  const token = url.searchParams.get('token')

  if (!token?.trim()) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 400 })
  }

  const { data: prof, error } = await loadProfByToken(token)

  if (error || !prof) {
    return new Response(JSON.stringify({ error: 'Prof introuvable' }), { status: 404 })
  }

  const { data: periode, error: periodeError } = await loadPeriodeActive()

  if (periodeError || !periode) {
    return new Response(JSON.stringify({ error: 'Période introuvable' }), { status: 404 })
  }

  /* Obtenir les données des pointages : date, session, statut */
  const { data: pointages, error: pointagesError } = await supabaseServer
    .schema('paie')
    .from('pointages')
    .select('date, session, statut')
    .eq('prof_id', prof.id)
    .eq('periode_id', periode.id)
    .order('date', { ascending: true })

  if (pointagesError) {
    return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des pointages' }), { status: 500 })
  }

  const { data: remuneration, error: remunerationError } = await supabaseServer
    .schema('paie')
    .from('prof_periode_montants')
    .select('montant_eur')
    .eq('periode_id', periode.id)
    .eq('prof_id', prof.id)
    .maybeSingle()

  const montantPeriode =
    !remunerationError && remuneration?.montant_eur != null
      ? Number(remuneration.montant_eur)
      : null

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
      fullName: `${prof.prenom} ${prof.nom}`,
      montant_periode: montantPeriode
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}
