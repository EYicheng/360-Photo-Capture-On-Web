import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// Optional HTTPS for local LAN testing (camera requires HTTPS on non-localhost).
// Certs are loaded only when present, so builds on other machines / CI still work.
const certPath = '/home/yicheng/192.168.3.10+2.pem'
const keyPath = '/home/yicheng/192.168.3.10+2-key.pem'
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // allow LAN access
    port: 5173,
    ...(hasCerts
      ? {
          https: {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath),
          },
        }
      : {}),
  },
})
