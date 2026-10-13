import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const enabled = (process.env.VITE_PUBLIC_GEMINI_ENABLED ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_PUBLIC_GEMINI_ENABLED) === 'true'
  return ({
  plugins: [react(), tailwindcss(), ...(mode === 'demo' ? [{
    name: 'public-demo-headers',
    generateBundle() {
      this.emitFile({
        type: 'asset', fileName: '_headers',
        source: `/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src '${enabled ? 'self' : 'none'}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`,
      })
    },
  } satisfies Plugin] : [])],
})})
