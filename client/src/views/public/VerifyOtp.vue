<template>
  <section class="flex items-center justify-center px-2">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 sm:p-10">
      <h1 class="text-2xl font-extrabold text-center text-gray-800 mb-4">Enter Your OTP</h1>

      <p class="text-base text-center text-gray-600 mb-6">
        We’ve sent a 6-digit code to your email:<br>
        <!-- Vue escapes by default, and we only ever show the sanitized value -->
        <strong>{{ safeEmail || '—' }}</strong>
      </p>

      <form @submit.prevent="onSubmit" class="space-y-6" novalidate>
        <div>
          <label for="otp" class="block text-sm font-medium text-gray-700 mb-1">OTP Code</label>
          <input
            id="otp"
            v-model="otp"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="Enter code"
            required
            @input="onOtpInput"
            @paste="onOtpPaste"
            @blur="markTouched('otp')"
            :aria-invalid="Boolean(otpError)"
            :class="[
              'w-full border rounded-lg py-2 px-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 transition',
              otpError ? 'border-red-500'
                : touched.otp && otp.length === 6 && !otpError
                  ? 'border-green-500'
                  : 'border-gray-300'
            ]"
          />
          <p v-if="otpError" class="text-xs text-red-600 mt-1">{{ otpError }}</p>
        </div>

        <div v-if="errorMessage" class="bg-red-100 text-red-700 p-2 rounded text-sm mb-2">
          {{ errorMessage }}
        </div>

        <button
          type="submit"
          class="w-full py-2 px-4 bg-green-600 text-white font-semibold rounded-lg shadow hover:bg-green-700 transition focus:outline-none focus:ring-2 focus:ring-green-400"
          :disabled="loading"
        >
          {{ loading ? 'Verifying...' : 'Verify Code' }}
        </button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { logSecurityClient } from '@/utils/logUtils'
import { getFriendlyError } from '@/utils/handleError'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// Keep your current env var name; change to VITE_API_BASE if that's what you use elsewhere
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3005'

const email = ref('')
const otp = ref('')              // raw but always sanitized on input
const errorMessage = ref('')
const loading = ref(false)
const refId = `OTP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
const otpError = ref('')
const touched = reactive({ otp: false })

/* ---------- Client-side sanitizers ---------- */
// Strict email sanitizer: allow only safe email chars; lowercase; cap length
function sanitizeEmail(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  // keep only a-z digits and common email symbols
  const cleaned = s.replace(/[^a-z0-9._%+\-@]/g, '').slice(0, 254)
  // simple shape check (keeps it client-side; backend remains unchanged)
  const parts = cleaned.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[1].length > 255) return ''
  return cleaned
}

// OTP: digits only, max 6
function sanitizeOtp(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 6)
}

/* ---------- Derived display value ---------- */
const safeEmail = computed(() => sanitizeEmail(email.value))

/* ---------- Validation ---------- */
function validateOtp() {
  otpError.value = ''
  if (!/^\d{6}$/.test(otp.value)) {
    otpError.value = 'Please enter the full 6-digit numeric code.'
  }
}

function markTouched(field) {
  touched[field] = true
  if (field === 'otp') validateOtp()
}

/* ---------- Input handlers (block junk at source) ---------- */
function onOtpInput(e) {
  const before = otp.value
  otp.value = sanitizeOtp(e.target.value)
  if (otp.value !== before) validateOtp()
}
function onOtpPaste(e) {
  const text = (e.clipboardData?.getData('text') || '')
  const digits = sanitizeOtp(text)
  if (!digits) {
    e.preventDefault() // block pasting non-digits
    return
  }
  e.preventDefault()
  otp.value = digits
  validateOtp()
}

/* ---------- Lifecycle ---------- */
onMounted(() => {
  // Prefer query param; fallback to sessionStorage (set by Login)
  const fromQuery = route.query.email
  const fromSession = sessionStorage.getItem('otp_email')
  email.value = sanitizeEmail(fromQuery || fromSession || '')
  if (!email.value) {
    errorMessage.value = `Missing or invalid email. Please go back and try again. (Ref: ${refId})`
    logSecurityClient({
      category: 'auth',
      action: 'otp_email_missing_or_invalid',
      details: `No valid email in query/session (refId: ${refId})`,
      severity: 'medium'
    })
  }
})

/* ---------- Submit ---------- */
async function onSubmit() {
  errorMessage.value = ''
  loading.value = true
  touched.otp = true

  // Re-sanitize before use (defense-in-depth)
  email.value = sanitizeEmail(email.value)
  otp.value = sanitizeOtp(otp.value)

  validateOtp()
  if (!email.value) {
    errorMessage.value = `Missing or invalid email. (Ref: ${refId})`
    loading.value = false
    return
  }
  if (otpError.value) {
    loading.value = false
    return
  }

  try {
    const api = axios.create({ baseURL: API_BASE, withCredentials: true })
    await api.get('/auth/csrf-token')

    // If your backend expects { code } instead, change "otp" to "code" here.
    await api.post('/auth/verify-otp', {
      email: email.value,          // already sanitized
      otp: otp.value,              // already sanitized, string of 6 digits
    })

    const { data: meData } = await api.get('/auth/me')
    if (meData?.user) auth.setUser(meData.user)

    logSecurityClient({
      category: 'auth',
      action: 'otp_verify_success',
      details: `OTP success for ${email.value} (refId: ${refId})`,
      severity: 'low'
    })

    const u = meData?.user || {}
    if (u.is_admin) {
      await router.replace({ path: '/admin/users' })
    } else {
      await router.replace({ path: '/mypapers' })
    }
  } catch (err) {
    errorMessage.value = getFriendlyError(err, 'OTP verification failed.', refId)
    logSecurityClient({
      category: 'auth',
      action: 'otp_verify_failed',
      details: `OTP failed for ${email.value} (refId: ${refId})`,
      severity: 'medium'
    })
  } finally {
    loading.value = false
  }
}
</script>
