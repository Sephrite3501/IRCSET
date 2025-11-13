import { createRouter, createWebHistory } from 'vue-router'
import axios from 'axios'

// Eager, relative imports
import Login from '../views/public/Login.vue'
import Register from '../views/public/Register.vue'
import MyPapers from '../views/public/MyPapers.vue'
import Submission from '../views/public/Submission.vue'
import AdminUsers from '../views/admin/AdminUsers.vue'
import ChairApprovedPapers from '../views/chair/ChairViewAllApproved.vue'
import VerifyOtp from '../views/public/VerifyOtp.vue'
const AdminEvents = () => import('../views/admin/AdminEvents.vue')
const ChairManageReviewers = () => import('../views/chair/ChairManageReviewers.vue')
const ChairAssignPapers = () => import('../views/chair/ChairAssignPapers.vue')
const Reviewer = () => import('../views/reviewer/ReviewPapers.vue')
const PaperDetails = () => import('../views/reviewer/PaperDetails.vue')
const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/register', component: Register, meta: { public: true } },
  { path: '/mypapers', component: MyPapers, meta: { requiresAuth: true } },
  { path: '/submission', component: Submission },
  { path: '/verify-otp',name : 'verify-otp',  component: VerifyOtp},
  { path: '/admin', redirect: '/admin/events' },                     
  { path: '/admin/events', component: AdminEvents, meta: { requiresAdmin: true } }, 
  { path: '/admin/users', component: AdminUsers, meta: { requiresAdmin: true } }, 
  { path: '/chair/reviewers', component: ChairManageReviewers, meta: { requiresAuth: true } },
  { path: '/chair/assign', component: ChairAssignPapers, meta: { requiresAuth: true } },
  { path: '/chair/approved-papers', component: ChairApprovedPapers, meta: { requiresAuth: true } },
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
  },
  {
  path: '/external-review/:token',
  name: 'externalReview',
  component: () => import('../views/public/externalReview.vue'),
  meta: { publicStandalone: true }
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  // 🚫 Skip all checks for standalone public routes (external review page)
  if (to.meta.publicStandalone) {
    return next()
  }

  // ✅ Allow public routes (login, register)
  if (to.meta.public) {
    // If user is already logged in and trying to access login/register, redirect to mypapers
    try {
      const { data } = await axios.get('/auth/me', { withCredentials: true })
      if (data?.user && (to.path === '/login' || to.path === '/register')) {
        return next('/mypapers')
      }
    } catch (err) {
      // Not logged in, allow access to public routes
    }
    return next()
  }

  // ✅ Admin routes
  if (to.meta.requiresAdmin) {
    try {
      const { data } = await axios.get('/auth/me', { withCredentials: true })
      if (data?.user?.is_admin) return next()
    } catch (err) {}
    return next('/login')
  }

  // ✅ Normal authenticated routes
  if (to.meta.requiresAuth) {
    try {
      const { data } = await axios.get('/auth/me', { withCredentials: true })
      if (data?.user) return next()
    } catch (err) {}
    return next('/login')
  }

  // fallback
  next()
})