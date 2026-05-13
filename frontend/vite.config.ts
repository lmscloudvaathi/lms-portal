import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  loadEnv(mode, __dirname, '')
  return {
    plugins: [react()],
    server: {
      port: 5173,
      hmr: {
        overlay: false,
      },
    },
  }
})
