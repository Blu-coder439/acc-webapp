import { createRouter, createWebHistory } from 'vue-router'
import { hydrateCurrentUserFromSession } from '@/utils/auth-session'
import { getCurrentUser } from '@/utils/user-settings'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'homepage',
      component: () => import('@/pages/general/homepage.vue'),
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/pages/general/signup.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/general/login.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/pages/general/user/dashboard.vue'),
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: () => import('@/pages/general/user/transactions.vue'),
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('@/pages/general/user/reports.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/pages/general/user/settings.vue'),
    },
    {
      path: '/adminpage',
      name: 'adminpage',
      component: () => import ('@/pages/general/admin/adminpage.vue')
    }
  ],
})

const protectedRoutes = new Set(['dashboard', 'transactions', 'reports', 'settings'])
const guestOnlyRoutes = new Set(['login', 'signup'])

router.beforeEach(async (to) => {
  let currentUser = getCurrentUser()

  if (!currentUser) {
    try {
      currentUser = await hydrateCurrentUserFromSession()
    } catch {
      currentUser = null
    }
  }

  if (protectedRoutes.has(to.name) && !currentUser) {
    return { name: 'login' }
  }

  if (guestOnlyRoutes.has(to.name) && currentUser) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
