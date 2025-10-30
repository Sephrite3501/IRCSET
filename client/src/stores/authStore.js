// src/stores/authStore.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)

  const setUser = (userData) => {
    user.value = userData
  }

  const clearUser = () => {
    user.value = null
  }

  const isLoggedIn = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.user_role === 'admin')
  const isInactive = computed(() => user.value?.account_status === 'inactive')

  return {
    user,
    setUser,
    clearUser,
    isLoggedIn,
    isAdmin,
    isInactive
  }
})
