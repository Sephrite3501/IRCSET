import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': `${__dirname}/src`,
    },
  },
  server: {
    watch: {
      usePolling: true,
    },
    host: true,
    strictPort: true,
    port: 8080,
    proxy: {
      // your existing /api proxy
      '/api': {
        target: 'http://ircset_server:3001',
        changeOrigin: true,
        secure: false,
      },
      // new /assets proxy
      '/assets': {
        target: 'http://ircset_server:3001',
        changeOrigin: true,
        secure: false,
      },
    }
  },
})

