/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SUPABASE_URL: string
  readonly SUPABASE_KEY: string
  readonly SUPABASE_SERVICE_ROLE_KEY: string
  readonly MAIL_TO: string
  readonly SMTP_HOST: string
  readonly SMTP_PORT: string
  readonly SMTP_USER: string
  readonly SMTP_PASSWORD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
