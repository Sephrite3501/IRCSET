<template>
  <nav class="w-full bg-gray-900 text-gray-100 flex justify-between items-center px-6 py-3">
    <!-- Logo -->
    <h1 class="text-lg font-semibold text-yellow-400 tracking-wide">
      IRCSET
    </h1>

    <!-- Links -->
    <ul class="flex space-x-6 text-sm font-medium">
      <li>
        <RouterLink to="/" class="hover:text-yellow-400 transition-colors duration-200">
          Home
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/dashboard" class="hover:text-yellow-400 transition-colors duration-200">
          Dashboard
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/submission" class="hover:text-yellow-400 transition-colors duration-200">
          Submit
        </RouterLink>
      </li>
      <li v-if="user?.is_admin">
      <RouterLink to="/admin/events" class="hover:text-yellow-400 transition-colors duration-200">
          Admin
      </RouterLink>
      </li>
      <li v-else-if="user?.roles?.includes('chair')">
        <RouterLink to="/chair" class="hover:text-yellow-400 transition-colors duration-200">
          Chair
        </RouterLink>
      </li>
      <li v-if="!user">
        <RouterLink to="/login" class="hover:text-yellow-400 transition-colors duration-200">
          Login
        </RouterLink>
      </li>
      <li v-else>
        <button
          @click="logout"
          class="text-sm text-red-400 hover:text-red-500 transition-colors duration-200"
        >
          Logout
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { RouterLink, useRoute, useRouter } from "vue-router"
import { ref, watch } from "vue"
import axios from "axios"

const route = useRoute()
const user = ref(null)
const router = useRouter()

async function fetchMe() {
  try {
    const { data } = await axios.get("/auth/me") // -> /api/auth/me via proxy
    user.value = data?.user || null
  } catch {
    user.value = null
  }
}
async function logout() {
  try {
    await axios.post("/auth/logout")
  } catch {}
  user.value = null
  router.push("/login")
}
// run once and on every route change
watch(() => route.fullPath, fetchMe, { immediate: true })
</script>
