import type { APIContext } from 'astro'
import nodemailer from 'nodemailer'
import { supabaseServer } from '../../lib/supabase-server'

export const prerender = false

const CAMPAIGN_TOKEN = import.meta.env.MAIL_CAMPAIGN_TOKEN
const SMTP_HOST = import.meta.env.SMTP_HOST
const SMTP_PORT = Number.parseInt(import.meta.env.SMTP_PORT, 10)
const SMTP_USER = import.meta.env.SMTP_USER
const SMTP_PASSWORD = import.meta.env.SMTP_PASSWORD

type ProfRow = {
  id: number
  prenom: string
  genre: 'Monsieur' | 'Madame' | null
  mail: string
  token: string
  mail_envoye: boolean
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Acces non autorise' }), { status: 401 })
}

function isAuthorized(request: Request): boolean {
  if (!CAMPAIGN_TOKEN) return false
  const headerToken = request.headers.get('x-campaign-token')?.trim()
  return headerToken === CAMPAIGN_TOKEN
}

function ensureSmtpConfig(): string | null {
  if (!SMTP_HOST || Number.isNaN(SMTP_PORT) || !SMTP_USER || !SMTP_PASSWORD) {
    return 'Configuration SMTP incomplète'
  }

  return null
}

function buildEmailBody(prof: Pick<ProfRow, 'prenom' | 'genre' | 'token'>): { text: string; html: string } {
  const civilite = prof.genre ?? 'Monsieur'
  const url = `https://pointer-cours.netlify.app/?token=${prof.token}`

  const text = [
    `Bonjour ${civilite} ${prof.prenom}`,
    '',
    'Vous remplir votre pointage pour la periode des cours au printemps 2026 en cliquant sur le lien ci-dessous :',
    '',
    url,
    '',
    'Ce lien est personnel. Merci de ne pas le partager.',
    '',
    'Apres validation, votre pointage sera enregistre automatiquement.',
    '',
    "BarakAllahou fik,",
    "L'equipe Al'Ihsane"
  ].join('\n')

  const html = `
    <p>Bonjour ${civilite} ${prof.prenom}</p>
    <p>Vous remplir votre pointage pour la periode des cours au printemps 2026 en cliquant sur le lien ci-dessous :</p>
    <p><a href="${url}">${url}</a></p>
    <p>Ce lien est personnel. Merci de ne pas le partager.</p>
    <p>Apres validation, votre pointage sera enregistre automatiquement.</p>
    <p>BarakAllahou fik,<br/>L'equipe Al'Ihsane</p>
  `.trim()

  return { text, html }
}

export async function GET({ request }: APIContext): Promise<Response> {
  if (!isAuthorized(request)) return unauthorized()

  const { data, error } = await supabaseServer
    .schema('paie')
    .from('profs')
    .select('id, prenom, genre, mail, token, mail_envoye')
    .eq('mail_envoye', false)
    .order('id', { ascending: true })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const profs = (data ?? []) as ProfRow[]

  return new Response(JSON.stringify({ profs }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function POST({ request }: APIContext): Promise<Response> {
  if (!isAuthorized(request)) return unauthorized()

  const smtpError = ensureSmtpConfig()
  if (smtpError) {
    return new Response(JSON.stringify({ error: smtpError }), { status: 500 })
  }

  let payload: { profId?: number }
  try {
    payload = (await request.json()) as { profId?: number }
  } catch {
    return new Response(JSON.stringify({ error: 'Payload JSON invalide' }), { status: 400 })
  }

  if (!payload.profId) {
    return new Response(JSON.stringify({ error: 'profId manquant' }), { status: 400 })
  }

  const { data: prof, error: profError } = await supabaseServer
    .schema('paie')
    .from('profs')
    .select('id, prenom, genre, mail, token, mail_envoye')
    .eq('id', payload.profId)
    .maybeSingle()

  if (profError || !prof) {
    return new Response(JSON.stringify({ error: 'Prof introuvable' }), { status: 404 })
  }

  if (prof.mail_envoye) {
    return new Response(JSON.stringify({ error: 'Mail deja envoye pour ce prof' }), { status: 409 })
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD
    }
  })

  const { text, html } = buildEmailBody(prof as ProfRow)

  try {
    await transporter.sendMail({
      from: SMTP_USER,
      to: prof.mail,
      subject: 'Pointage des cours printemps 2026',
      text,
      html
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return new Response(JSON.stringify({ error: `Erreur envoi mail: ${message}` }), { status: 500 })
  }

  const { error: updateError } = await supabaseServer
    .schema('paie')
    .from('profs')
    .update({ mail_envoye: true })
    .eq('id', prof.id)

  if (updateError) {
    return new Response(JSON.stringify({ error: `Mail envoye mais echec update: ${updateError.message}` }), {
      status: 500
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
