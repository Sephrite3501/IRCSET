import { createRouter, createWebHistory } from 'vue-router'

// Eager, relative imports
import Login from '../views/public/Login.vue'
import Register from '../views/public/Register.vue'
// (optional) if you want a dashboard page:
import Dashboard from '../views/public/Dashboard.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/dashboard', component: Dashboard }, // or delete if not needed
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
