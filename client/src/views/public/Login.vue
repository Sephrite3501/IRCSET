<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function submit() {
  loading.value = true
  errorMsg.value = ''
  try {
    // ensure CSRF token exists (your server provides this endpoint)
    await axios.get('/auth/csrf-token')
    await axios.post('/auth/login', { email: email.value, password: password.value })
    router.push('/dashboard')
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main style="max-width:420px;margin:40px auto;">
    <h1>Login</h1>
    <form @submit.prevent="submit">
      <label>Email</label>
      <input v-model="email" type="email" required />
      <label>Password</label>
      <input v-model="password" type="password" required />
      <button :disabled="loading">{{ loading ? 'Logging in…' : 'Login' }}</button>
      <p v-if="errorMsg" style="color:red">{{ errorMsg }}</p>
    </form>
    <p style="margin-top:12px">
      No account? <router-link to="/register">Register</router-link>
    </p>
  </main>
</template>
