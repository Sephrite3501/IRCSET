import { createApp } from 'vue'
import App from './App.vue'   
import { router } from './router/index.js'
import { createPinia } from 'pinia'
import axios from 'axios'

// ---- axios global config (no helper) ----
axios.defaults.baseURL = '/api'
axios.defaults.withCredentials = true

const CSRF_COOKIE = import.meta.env.VITE_CSRF_COOKIE || 'csrf-token'
const CSRF_HEADER = 'X-CSRF-Token'

function readCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return m ? decodeURIComponent(m[2]) : null
}

axios.interceptors.request.use((config) => {
  const m = (config.method || 'get').toLowerCase()
  if (['post','put','patch','delete'].includes(m)) {
    const token = readCookie(CSRF_COOKIE)
    if (token) (config.headers ??= {})[CSRF_HEADER] = token
  }
  return config
})

// seed CSRF cookie/token early (your server also has GET /auth/csrf-token)
axios.get('/auth/csrf-token').catch(() => {})

createApp(App).use(createPinia()).use(router).mount('#app')
