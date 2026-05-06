import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

// Defaults do Supabase BStech embutidos build-time. Ficam fora do código
// fonte público pra não vazarem no GitHub. Em CI lê dos secrets do
// repositório, em dev local lê do app/.env (gitignored).
const env = loadEnv(process.env.NODE_ENV ?? 'development', __dirname, 'BSTECH_')
const SUPABASE_DEFAULTS = {
  'process.env.BSTECH_SUPABASE_URL': JSON.stringify(
    env.BSTECH_SUPABASE_URL ?? process.env.BSTECH_SUPABASE_URL ?? ''
  ),
  'process.env.BSTECH_SUPABASE_ANON_KEY': JSON.stringify(
    env.BSTECH_SUPABASE_ANON_KEY ?? process.env.BSTECH_SUPABASE_ANON_KEY ?? ''
  ),
  'process.env.BSTECH_CLIENT_ID': JSON.stringify(
    env.BSTECH_CLIENT_ID ?? process.env.BSTECH_CLIENT_ID ?? ''
  )
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: SUPABASE_DEFAULTS,
    build: {
      rollupOptions: {
        external: ['serialport', 'modbus-serial']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
