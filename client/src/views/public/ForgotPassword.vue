<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { useToast } from "../../composables/useToast.js";

const router = useRouter();
const toast = useToast();

const rawEmail = ref("");
const loading = ref(false);
const errorMsg = ref("");
const successMsg = ref("");

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3005";
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

// Lenient: safe to run on every keystroke
function sanitizeEmailLoose(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[\u0000-\u001F\u007F]/g, "")   // strip control chars
    .replace(/[^a-z0-9._%+\-@]/g, "")        // keep typical email chars
    .slice(0, 254);
}

// Strict: only used during validate()/submit()
function isValidEmailShape(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function getEmail() { return sanitizeEmailLoose(rawEmail.value).trim(); }

function validate() {
  const e = getEmail();
  if (!isValidEmailShape(e)) return "Please enter a valid email address.";
  return null;
}

/* ---------------- Recaptcha loader/executor ---------------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

onMounted(async () => {
  document.title = "Forgot Password - IRC-SET";
  try {
    if (SITE_KEY) {
      await loadScript(`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`);
    }
  } catch {
    // submit() will surface a clearer error if grecaptcha is unavailable
  }
});

const executeRecaptcha = () =>
  new Promise((resolve, reject) => {
    if (!SITE_KEY) return reject(new Error("Missing reCAPTCHA site key"));
    if (!window.grecaptcha || typeof window.grecaptcha.ready !== "function") {
      return reject(new Error("reCAPTCHA not loaded"));
    }
    window.grecaptcha.ready(() => {
      window.grecaptcha.execute(SITE_KEY, { action: "forgot_password" })
        .then(resolve)
        .catch(reject);
    });
  });

/* ---------------- Submit ---------------- */
async function submit() {
  if (loading.value) return;
  errorMsg.value = "";
  successMsg.value = "";

  const v = validate();
  if (v) {
    errorMsg.value = v;
    toast.error(v);
    return;
  }

  loading.value = true;
  try {
    const api = axios.create({ baseURL: API_BASE, withCredentials: true });

    // CSRF cookie (required by your server)
    await api.get("/auth/csrf-token");

    // reCAPTCHA v3 token
    const captchaToken = await executeRecaptcha();

    // Request password reset
    const response = await api.post(
      "/auth/forgot-password",
      {
        email: getEmail(),
        captchaToken,
      },
      { headers: { "X-Captcha-Token": captchaToken } }
    );

    const message = response.data?.message || "If an account with that email exists, a password reset link has been sent.";
    successMsg.value = message;
    toast.success(message, { timeout: 5000 });
  } catch (err) {
    const data = err?.response?.data;
    const error = data?.message ||
      data?.error ||
      (data?.errors && Object.values(data.errors).flat().join(" ")) ||
      err?.message ||
      "Failed to send reset email";
    errorMsg.value = error;
    toast.error(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4"
  >
    <div class="w-full max-w-sm bg-white border border-slate-200 shadow-xl rounded-xl p-8">
      <!-- Header -->
      <h1 class="text-3xl font-bold text-center text-indigo-700 mb-2 tracking-tight">
        Forgot Password
      </h1>
      <p class="text-gray-500 text-center mb-8 text-sm">
        Enter your email address and we'll send you a link to reset your password
      </p>

      <!-- Form -->
      <form @submit.prevent="submit" class="space-y-5" novalidate>
        <!-- Email -->
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            v-model="rawEmail"
            @input="rawEmail = sanitizeEmailLoose($event.target.value)"
            type="email"
            inputmode="email"
            autocomplete="email"
            required
            placeholder="you@example.com"
            class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
        </div>

        <!-- Success Message -->
        <div v-if="successMsg" class="p-3 bg-green-50 border border-green-200 rounded-md">
          <p class="text-green-700 text-sm text-center">
            {{ successMsg }}
          </p>
        </div>

        <!-- Error -->
        <p v-if="errorMsg" class="text-red-500 text-sm text-center mt-1">
          {{ errorMsg }}
        </p>

        <!-- Button -->
        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 mt-3 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {{ loading ? "Sending…" : "Send Reset Link" }}
        </button>
      </form>

      <!-- Footer -->
      <div class="mt-6 space-y-2">
        <p class="text-sm text-gray-500 text-center">
          Remember your password?
          <RouterLink to="/login" class="text-indigo-600 hover:text-indigo-800 font-medium">
            Back to Login
          </RouterLink>
        </p>
        <p class="text-sm text-gray-500 text-center">
          No account?
          <RouterLink to="/register" class="text-indigo-600 hover:text-indigo-800 font-medium">
            Register
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

