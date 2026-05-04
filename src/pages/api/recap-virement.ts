import type { APIContext } from 'astro'
import { supabaseServer } from '../../lib/supabase-server'

export const prerender = false

type Body = {
  token?: string
  /** uuid (periodes.id) ou chaine envoyee par le client */
  periodeId?: string | number
  /** uuid ou bigint selon la base */
  profId?: string | number
  fait?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asIdString(v: string | number | undefined): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function isValidPeriodeId(s: string): boolean {
  return UUID_RE.test(s)
}

function isValidProfId(s: string): boolean {
  return UUID_RE.test(s) || /^\d+$/.test(s)
}

export async function POST({ request }: APIContext): Promise<Response> {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 })
  }

  const expected = (import.meta.env.RECAP_TOKEN ?? '').trim()
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: 'Non autorise' }), { status: 403 })
  }

  const periodeId = asIdString(body.periodeId)
  const profId = asIdString(body.profId)
  if (!periodeId || !profId || !isValidPeriodeId(periodeId) || !isValidProfId(profId)) {
    return new Response(JSON.stringify({ error: 'Parametres invalides' }), { status: 400 })
  }

  const fait = Boolean(body.fait)

  const { error } = await supabaseServer
    .schema('paie')
    .from('recap_virements')
    .upsert(
      {
        periode_id: periodeId,
        prof_id: profId,
        fait,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'periode_id,prof_id' }
    )

  if (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.details ?? undefined,
        hint: error.hint ?? undefined,
        code: error.code ?? undefined
      }),
      { status: 500 }
    )
  }

  return new Response(JSON.stringify({ ok: true, fait }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
