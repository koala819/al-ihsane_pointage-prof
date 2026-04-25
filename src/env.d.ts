/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY: string
  readonly SUPABASE_URL: string
  readonly SUPABASE_KEY: string
  readonly SUPABASE_SERVICE_ROLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
