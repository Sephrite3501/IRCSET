<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";

const router = useRouter();

const rawEmail = ref("");
const rawPassword = ref("");
const loading = ref(false);
const errorMsg = ref("");

// keep your current env var key (change to VITE_API_BASE if you use that elsewhere)
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

function sanitizePasswordLoose(input) {
  return String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")   // strip control chars
    .slice(0, 256)
    .trim();
}

function getEmail() { return sanitizeEmailLoose(rawEmail.value).trim(); }
function getPassword() { return sanitizePasswordLoose(rawPassword.value); }

function validate() {
  const e = getEmail();
  const p = getPassword();
  if (!isValidEmailShape(e)) return "Please enter a valid email address.";
  if (!p) return "Please enter your password.";
  if (p.length < 8) return "Password must be at least 8 characters.";
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
  document.title = "IRC-SET";
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
      window.grecaptcha.execute(SITE_KEY, { action: "login" })
        .then(resolve)
        .catch(reject);
    });
  });

/* ---------------- Submit ---------------- */
async function submit() {
  if (loading.value) return;
  errorMsg.value = "";

  const v = validate();
  if (v) {
    errorMsg.value = v;
    return;
  }

  loading.value = true;
  try {
    const api = axios.create({ baseURL: API_BASE, withCredentials: true });

    // CSRF cookie (required by your server)
    await api.get("/auth/csrf-token");

    // reCAPTCHA v3 token
    const captchaToken = await executeRecaptcha();

    // Request OTP initiation
    await api.post(
      "/auth/login",
      {
        email: email.value,            // sanitized, lowercased
        password: password.value,      // trimmed, control chars removed
        captchaToken,                  // body
      },
      { headers: { "X-Captcha-Token": captchaToken } } // header too
    );

    // Carry email to OTP page (also in query string)
    sessionStorage.setItem("otp_email", email.value);
    router.push({ name: "verify-otp", query: { email: email.value } });
  } catch (err) {
    const data = err?.response?.data;
    errorMsg.value =
      data?.message ||
      data?.error ||
      (data?.errors && Object.values(data.errors).flat().join(" ")) ||
      err?.message ||
      "Login failed";
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
        IRC-SET Portal
      </h1>
      <p class="text-gray-500 text-center mb-8 text-sm">
        Sign in to access submissions and reviews
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
              @input="rawEmail = sanitizeEmail($event.target.value)"
              type="email"
              inputmode="email"
              autocomplete="email"
              required
              placeholder="you@example.com"
              class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
            />
        </div>

        <!-- Password -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            v-model="rawPassword"
            @input="rawPassword = sanitizePassword($event.target.value)"
            type="password"
            autocomplete="current-password"
            required
            placeholder="••••••••"
            class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
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
          {{ loading ? "Logging in…" : "Login" }}
        </button>
      </form>

      <!-- Footer -->
      <p class="text-sm text-gray-500 text-center mt-6">
        No account?
        <RouterLink to="/register" class="text-indigo-600 hover:text-indigo-800 font-medium">
          Register
        </RouterLink>
      </p>
    </div>
  </div>
</template>
