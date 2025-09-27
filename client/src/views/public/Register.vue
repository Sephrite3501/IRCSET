<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

function validate() {
  const n = name.value.trim()
  const e = email.value.trim()
  const p = password.value
  if (!n) return 'Please enter your name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Please enter a valid email address.'
  if (!(typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p))) {
    return 'Password must be at least 8 characters and include letters and numbers.'
  }
  return null
}

async function submit() {
  if (loading.value) return
  errorMsg.value = ''

  const v = validate()
  if (v) { errorMsg.value = v; return }

  loading.value = true
  try {
    // Ensure CSRF cookie exists
    await axios.get('/auth/csrf-token')

    // Backend requires: name, email, password
    await axios.post('/auth/register', {
      name: name.value.trim(),
      email: email.value.trim().toLowerCase(),
      password: password.value
    })

    // If register doesn't auto-login, send them to login
    router.push('/auth/login')
  } catch (e) {
    console.error('Register error:', e?.response?.status, e?.response?.data)
    const data = e?.response?.data
    errorMsg.value =
      data?.message ||
      data?.error ||
      (data?.errors && Object.values(data.errors).flat().join(' ')) ||
      'Register failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main style="max-width:420px;margin:40px auto;">
    <h1>Register</h1>
    <form @submit.prevent="submit">
      <label>Name</label>
      <input v-model.trim="name" type="text" required autocomplete="name" />

      <label>Email</label>
      <input v-model.trim="email" type="email" required autocomplete="email" />

      <label>Password</label>
      <input v-model="password" type="password" required autocomplete="new-password" />

      <button :disabled="loading">{{ loading ? 'Creating…' : 'Create account' }}</button>
      <p v-if="errorMsg" style="color:red;margin-top:8px">{{ errorMsg }}</p>
    </form>
    <p style="margin-top:12px">
      Already have an account? <router-link to="/login">Login</router-link>
    </p>
  </main>
</template>
