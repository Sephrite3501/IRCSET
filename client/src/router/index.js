import { createRouter, createWebHistory } from 'vue-router'
import axios from 'axios'

// Eager, relative imports
import Login from '../views/public/Login.vue'
import Register from '../views/public/Register.vue'
import MyPapers from '../views/public/MyPapers.vue'
// (optional) if you want a dashboard page:
import Dashboard from '../views/public/Dashboard.vue'
import Submission from '../views/public/Submission.vue'
const AdminEvents = () => import('../views/admin/AdminEvents.vue')
const ChairManageReviewers = () => import('../views/chair/ChairManageReviewers.vue')
const ChairAssignPapers = () => import('../views/chair/ChairAssignPapers.vue')
const Reviewer = () => import('../views/reviewer/ReviewPapers.vue')
const PaperDetails = () => import('../views/reviewer/PaperDetails.vue')
const routes = [
  { path: '/', component: MyPapers },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/dashboard', component: Dashboard }, // or delete if not needed
  { path: '/submission', component: Submission },
  { path: '/admin', redirect: '/admin/events' },                     
  { path: '/admin/events', component: AdminEvents, meta: { requiresAdmin: true } }, 
  { path: '/chair/reviewers', component: ChairManageReviewers, meta: { requiresAuth: true } },
  { path: '/chair/assign', component: ChairAssignPapers, meta: { requiresAuth: true } },
  { path: '/tasks/assigned', component: Reviewer, meta: { requiresAuth: true } },
  {
    path: '/review/:eventId/:paperId',
    name: 'PaperDetails',
    component: PaperDetails,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/review/:eventId/:paperId',
    component: () => import('../views/reviewer/PaperDetails.vue'),
    meta: { requiresAuth: true }
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  if (!to.meta?.requiresAdmin) return next()

  try {
    const { data } = await axios.get('/auth/me') // -> /api/auth/me
    if (data?.user?.is_admin) return next()
  } catch {}
  next('/login')
})