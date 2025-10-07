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
  <div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
    <div class="bg-gray-800 rounded-xl shadow-lg p-8 w-full max-w-sm border border-gray-700">
      <h1 class="text-2xl font-semibold text-yellow-400 mb-6 text-center">Login</h1>

      <form @submit.prevent="submit" class="space-y-4">
        <!-- Email -->
        <div>
          <label for="email" class="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            placeholder="you@example.com"
            class="w-full rounded-md bg-gray-900 border border-gray-700 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>

        <!-- Password -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
            class="w-full rounded-md bg-gray-900 border border-gray-700 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>

        <!-- Error message -->
        <p v-if="errorMsg" class="text-red-400 text-sm text-center mt-2">
          {{ errorMsg }}
        </p>

        <!-- Button -->
        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2 mt-2 rounded-md bg-yellow-400 text-gray-900 font-semibold hover:bg-yellow-300 transition disabled:opacity-60"
        >
          {{ loading ? "Logging in…" : "Login" }}
        </button>
      </form>

      <p class="text-sm text-gray-400 text-center mt-6">
        No account?
        <RouterLink to="/register" class="text-yellow-400 hover:underline">Register</RouterLink>
      </p>
    </div>
  </div>
</template>
