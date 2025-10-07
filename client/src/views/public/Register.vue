<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";

const router = useRouter();
const name = ref("");
const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMsg = ref("");

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
    return;
  }

  loading.value = true;
  try {
    await axios.get("/auth/csrf-token");
    await axios.post("/auth/register", {
      name: name.value.trim(),
      email: email.value.trim().toLowerCase(),
      password: password.value,
    });
    router.push("/login");
  } catch (e) {
    const data = e?.response?.data;
    errorMsg.value =
      data?.message ||
      data?.error ||
      (data?.errors && Object.values(data.errors).flat().join(" ")) ||
      "Register failed";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
    <div class="bg-gray-800 rounded-xl shadow-lg p-8 w-full max-w-sm border border-gray-700">
      <h1 class="text-2xl font-semibold text-yellow-400 mb-6 text-center">Create Account</h1>

      <form @submit.prevent="submit" class="space-y-4">
        <!-- Name -->
        <div>
          <label for="name" class="block text-sm font-medium text-gray-300 mb-1">Name</label>
          <input
            id="name"
            v-model.trim="name"
            type="text"
            required
            autocomplete="name"
            placeholder="John Doe"
            class="w-full rounded-md bg-gray-900 border border-gray-700 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>

        <!-- Email -->
        <div>
          <label for="email" class="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            id="email"
            v-model.trim="email"
            type="email"
            required
            autocomplete="email"
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
            autocomplete="new-password"
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
          {{ loading ? "Creating…" : "Create Account" }}
        </button>
      </form>

      <p class="text-sm text-gray-400 text-center mt-6">
        Already have an account?
        <RouterLink to="/login" class="text-yellow-400 hover:underline">Login</RouterLink>
      </p>
    </div>
  </div>
</template>
