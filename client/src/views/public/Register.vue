<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { useToast } from "../../composables/useToast.js";

const router = useRouter();
const toast = useToast();
const name = ref("");
const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMsg = ref("");
const successMsg = ref("");

function validate() {
  const n = name.value.trim();
  const e = email.value.trim();
  const p = password.value;
  if (!n) return "Please enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Please enter a valid email address.";
  if (!(typeof p === "string" && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p))) {
    return "Password must be at least 8 characters and include letters and numbers.";
  }
  return null;
}

async function submit() {
  if (loading.value) return;
  errorMsg.value = "";

  const v = validate();
  if (v) { 
    errorMsg.value = v;
    toast.error(v);
    return;
  }

  loading.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    const api = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3005",
      withCredentials: true,
    });

    await api.get("/auth/csrf-token");

    // ✅ get v3 token
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    const captchaToken = await new Promise((resolve, reject) => {
      if (!window.grecaptcha) return reject(new Error("reCAPTCHA not loaded"));
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(siteKey, { action: 'register' })
          .then(resolve).catch(reject);
      });
    });

    const response = await api.post(
      "/auth/register",
      {
        name: name.value.trim(),
        email: email.value.trim().toLowerCase(),
        password: password.value,
        captchaToken, // body fallback
      },
      {
        headers: { "X-Captcha-Token": captchaToken }, // header fallback
        withCredentials: true,
      }
    );

    const message = response.data?.message || "Registration successful! Please check your email to activate your account.";
    successMsg.value = message;
    toast.success(message, { timeout: 5000 });
    
    // Redirect to login after showing message
    setTimeout(() => {
      router.push("/login");
    }, 2000);
  } catch (e) {
    const data = e?.response?.data;
    const error = data?.message ||
      data?.error ||
      (data?.errors && Object.values(data.errors).flat().join(" ")) ||
      "Registration failed";
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
    <div
      class="w-full max-w-sm bg-white border border-slate-200 shadow-xl rounded-xl p-8"
    >
      <!-- Header -->
      <h1
        class="text-3xl font-bold text-center text-indigo-700 mb-2 tracking-tight"
      >
        Create Account
      </h1>
      <p class="text-gray-500 text-center mb-8 text-sm">
        Join IRC-SET to submit or review conference papers
      </p>

      <!-- Form -->
      <form @submit.prevent="submit" class="space-y-5">
        <!-- Name -->
        <div>
          <label
            for="name"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Full Name
          </label>
          <input
            id="name"
            v-model.trim="name"
            type="text"
            required
            autocomplete="name"
            placeholder="John Doe"
            class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
        </div>

        <!-- Email -->
        <div>
          <label
            for="email"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            v-model.trim="email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
        </div>

        <!-- Password -->
        <div>
          <label
            for="password"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            autocomplete="new-password"
            placeholder="••••••••"
            class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
        </div>
        
        <!-- Success message -->
        <div v-if="successMsg" class="p-3 bg-green-50 border border-green-200 rounded-md">
          <p class="text-green-700 text-sm text-center">
            {{ successMsg }}
          </p>
        </div>
        
        <!-- Error message -->
        <p
          v-if="errorMsg"
          class="text-red-500 text-sm text-center mt-1"
        >
          {{ errorMsg }}
        </p>

        <!-- Button -->
        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 mt-3 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {{ loading ? "Creating…" : "Create Account" }}
        </button>
      </form>

      <!-- Footer -->
      <p class="text-sm text-gray-500 text-center mt-6">
        Already have an account?
        <RouterLink
          to="/login"
          class="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Login
        </RouterLink>
      </p>
    </div>
  </div>
</template>
