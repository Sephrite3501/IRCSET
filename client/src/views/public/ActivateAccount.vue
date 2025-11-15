<script setup>
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";
import { useToast } from "../../composables/useToast.js";

const router = useRouter();
const route = useRoute();
const toast = useToast();

const loading = ref(true);
const message = ref("");
const error = ref("");

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3005";
const token = route.query.token;

onMounted(async () => {
  document.title = "Activate Account - IRC-SET";
  
  if (!token) {
    error.value = "Invalid activation link. No token provided.";
    loading.value = false;
    toast.error("Invalid activation link");
    return;
  }

  try {
    const api = axios.create({ baseURL: API_BASE, withCredentials: true });
    await api.get("/auth/csrf-token");
    
    const response = await api.get(`/auth/activate?token=${encodeURIComponent(token)}`);
    
    message.value = response.data?.message || "Account activated successfully!";
    toast.success("Account activated successfully!");
    
    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push("/login");
    }, 3000);
  } catch (err) {
    const data = err?.response?.data;
    error.value = data?.message || data?.error || "Activation failed. Please try again.";
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4"
  >
    <div class="w-full max-w-sm bg-white border border-slate-200 shadow-xl rounded-xl p-8">
      <div v-if="loading" class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p class="text-gray-600">Activating your account...</p>
      </div>
      
      <div v-else-if="message" class="text-center">
        <div class="mb-4">
          <svg class="mx-auto h-16 w-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-gray-800 mb-2">Account Activated!</h2>
        <p class="text-gray-600 mb-6">{{ message }}</p>
        <p class="text-sm text-gray-500">Redirecting to login page...</p>
      </div>
      
      <div v-else-if="error" class="text-center">
        <div class="mb-4">
          <svg class="mx-auto h-16 w-16 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-gray-800 mb-2">Activation Failed</h2>
        <p class="text-gray-600 mb-6">{{ error }}</p>
        <RouterLink
          to="/login"
          class="inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
        >
          Go to Login
        </RouterLink>
      </div>
    </div>
  </div>
</template>

