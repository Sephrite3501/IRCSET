<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";

const router = useRouter();
const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMsg = ref("");

async function submit() {
  loading.value = true;
  errorMsg.value = "";
  try {
    await axios.get("/auth/csrf-token");
    await axios.post("/auth/login", { email: email.value, password: password.value });
    router.push("/dashboard");
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "Login failed";
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
        IRCSET Portal
      </h1>
      <p class="text-gray-500 text-center mb-8 text-sm">
        Sign in to access submissions and reviews
      </p>

      <!-- Form -->
      <form @submit.prevent="submit" class="space-y-5">
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
            v-model="email"
            type="email"
            required
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
            placeholder="••••••••"
            class="w-full rounded-md border border-gray-300 text-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
        </div>

        <!-- Error Message -->
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
        <RouterLink
          to="/register"
          class="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Register
        </RouterLink>
      </p>
    </div>
  </div>
</template>

