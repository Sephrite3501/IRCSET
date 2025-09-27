<script setup>
import axios from 'axios'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const user = ref(null)

onMounted(async () => {
  try {
    const { data } = await axios.get('/auth/me')
    user.value = data?.user || null
    if (!user.value) router.push('/login')
  } catch {
    router.push('/login')
  }
})

async function logout() {
  try {
    await axios.post('/auth/logout')
  } finally {
    router.push('/login')
  }
}
</script>

<template>
  <main style="max-width:720px;margin:40px auto;">
    <h1>Dashboard</h1>
    <p v-if="user">Signed in as <b>{{ user.email }}</b></p>
    <button @click="logout">Logout</button>
  </main>
</template>
