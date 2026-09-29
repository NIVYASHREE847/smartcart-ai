import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// FRONTEND_API_URL = public backend URL (e.g. https://smartcart-api.onrender.com). Empty = same origin / dev proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __API_URL__: JSON.stringify((process.env.FRONTEND_API_URL || process.env.VITE_API_URL || '').replace(/\/$/, '')) },
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
