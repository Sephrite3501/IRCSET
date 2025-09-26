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
    await axios.get('/auth/csrf-token')
    await axios.post('/auth/register', { email: email.value, password: password.value })
    // optionally auto-login, or redirect to login
    router.push('/dashboard')
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Register failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main style="max-width:420px;margin:40px auto;">
    <h1>Register</h1>
    <form @submit.prevent="submit">
      <label>Email</label>
      <input v-model="email" type="email" required />
      <label>Password</label>
      <input v-model="password" type="password" required />
      <button :disabled="loading">{{ loading ? 'Creating…' : 'Create account' }}</button>
      <p v-if="errorMsg" style="color:red">{{ errorMsg }}</p>
    </form>
    <p style="margin-top:12px">
      Already have an account? <router-link to="/login">Login</router-link>
    </p>
  </main>
</template>
