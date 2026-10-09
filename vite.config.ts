import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const CSP =
  "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'"

// Dev server needs inline scripts and websockets for HMR, so CSP is only applied to production builds.
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  worker: {
    format: 'es',
  },
})
