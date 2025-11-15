<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";
import { useToast } from "../../composables/useToast.js";

const router = useRouter();
const route = useRoute();
const toast = useToast();

const rawPassword = ref("");
const rawConfirmPassword = ref("");
const loading = ref(false);
const errorMsg = ref("");
const successMsg = ref("");

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3005";
const token = computed(() => route.query.token || "");

function sanitizePasswordLoose(input) {
  return String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")   // strip control chars
    .slice(0, 256)
    .trim();
}

function getPassword() { return sanitizePasswordLoose(rawPassword.value); }
function getConfirmPassword() { return sanitizePasswordLoose(rawConfirmPassword.value); }

function validate() {
  const p = getPassword();
  const cp = getConfirmPassword();
  
  if (!p) return "Please enter a new password.";
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (!cp) return "Please confirm your password.";
  if (p !== cp) return "Passwords do not match.";
  return null;
}

onMounted(() => {
  document.title = "Reset Password - IRC-SET";
  if (!token.value) {
    errorMsg.value = "Invalid reset link. Please request a new password reset.";
    toast.error("Invalid reset link");
  }
});

/* ---------------- Submit ---------------- */
async function submit() {
  if (loading.value || !token.value) return;
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

    // Reset password
    const response = await api.post(
      "/auth/reset-password",
      {
        token: token.value,
        password: getPassword(),
      }
    );

    const message = response.data?.message || "Password has been reset successfully. Redirecting to login...";
    successMsg.value = message;
    toast.success("Password reset successfully!");
    
    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push("/login");
    }, 3000);
  } catch (err) {
    const data = err?.response?.data;
    const error = data?.message ||
      data?.error ||
      (data?.errors && Object.values(data.errors).flat().join(" ")) ||
      err?.message ||
      "Failed to reset password";
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
        Reset Password
      </h1>
      <p class="text-gray-500 text-center mb-8 text-sm">
        Enter your new password below
      </p>

      <!-- Form -->
      <form @submit.prevent="submit" class="space-y-5" novalidate v-if="token">
        <!-- New Password -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <input
            id="password"
            v-model="rawPassword"
            @input="rawPassword = sanitizePasswordLoose($event.target.value)"
            type="password"
            autocomplete="new-password"
            required
            placeholder="••••••••"
            class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
          <p class="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
        </div>

        <!-- Confirm Password -->
        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            v-model="rawConfirmPassword"
            @input="rawConfirmPassword = sanitizePasswordLoose($event.target.value)"
            type="password"
            autocomplete="new-password"
            required
            placeholder="••••••••"
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
          :disabled="loading || !token"
          class="w-full py-2.5 mt-3 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {{ loading ? "Resetting…" : "Reset Password" }}
        </button>
      </form>

      <!-- Invalid Token Message -->
      <div v-if="!token" class="text-center">
        <p class="text-red-500 text-sm mb-4">
          {{ errorMsg || "Invalid reset link. Please request a new password reset." }}
        </p>
        <RouterLink
          to="/forgot-password"
          class="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
        >
          Request New Reset Link
        </RouterLink>
      </div>

      <!-- Footer -->
      <p v-if="token" class="text-sm text-gray-500 text-center mt-6">
        Remember your password?
        <RouterLink to="/login" class="text-indigo-600 hover:text-indigo-800 font-medium">
          Back to Login
        </RouterLink>
      </p>
    </div>
  </div>
</template>

