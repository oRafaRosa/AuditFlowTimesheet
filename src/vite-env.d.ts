/// <reference types="vite/client" />

// declaração de tipos pras variáveis de ambiente
// vite precisa disso pra typescript entender o import.meta.env
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
