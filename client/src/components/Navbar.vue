<template>
  <nav
    class="w-full bg-gray-950/95 backdrop-blur-sm text-gray-100 border-b border-gray-800 shadow-lg"
  >
    <div class="max-w-7xl mx-auto flex justify-between items-center px-6 py-3">
      <!-- Brand -->
      <RouterLink to="/" class="flex items-center space-x-2 group">
        <h1
          class="text-2xl font-semibold tracking-wide text-yellow-400 group-hover:text-yellow-300 transition-colors duration-200"
        >
          IRC-SET
        </h1>
      </RouterLink>

      <!-- Nav Links -->
      <ul class="flex items-center space-x-6 text-sm font-medium">
        <!-- Show only Login if not logged in -->
        <template v-if="!user">
          <li>
            <RouterLink
              to="/login"
              class="hover:text-yellow-400 transition-colors duration-200"
            >
              Login
            </RouterLink>
          </li>
        </template>

        <!-- Show everything else only after login -->
        <template v-else>
          <li>
            <RouterLink
              to="/"
              class="hover:text-yellow-400 transition-colors duration-200"
              :class="{ 'text-yellow-400': route.path === '/' }"
            >
              My Papers
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/dashboard"
              class="hover:text-yellow-400 transition-colors duration-200"
              :class="{ 'text-yellow-400': route.path.startsWith('/dashboard') }"
            >
              Dashboard
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/submission"
              class="hover:text-yellow-400 transition-colors duration-200"
              :class="{ 'text-yellow-400': route.path.startsWith('/submission') }"
            >
              Submit
            </RouterLink>
          </li>

          <!-- Admin Dropdown -->
          <li v-if="user?.is_admin" class="relative group">
            <span
              class="hover:text-yellow-400 cursor-pointer transition-colors duration-200 flex items-center px-2 py-1"
            >
              Admin
              <svg
                class="ml-1 w-4 h-4 transform group-hover:rotate-180 transition-transform duration-200"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <ul
              class="absolute left-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20 min-w-[160px]
                     opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100
                     transition-all duration-200 ease-out
                     pointer-events-none group-hover:pointer-events-auto"
            >
              <li><RouterLink to="/admin/users" class="block px-4 py-2 text-sm hover:bg-gray-800 hover:text-yellow-400 transition">Manage Users</RouterLink></li>
              <li><RouterLink to="/admin/submissions" class="block px-4 py-2 text-sm hover:bg-gray-800 hover:text-yellow-400 transition">Manage Submissions</RouterLink></li>
              <li><RouterLink to="/admin/reviews" class="block px-4 py-2 text-sm hover:bg-gray-800 hover:text-yellow-400 transition">Manage Reviews</RouterLink></li>
              <li><RouterLink to="/admin/events" class="block px-4 py-2 text-sm hover:bg-gray-800 hover:text-yellow-400 transition">Manage Events</RouterLink></li>
            </ul>
          </li>

          <!-- Chair Dropdown -->
          <li v-if="user?.roles?.includes('chair')" class="relative group">
            <span
              class="hover:text-yellow-400 cursor-pointer transition-colors duration-200 flex items-center px-2 py-1"
            >
              Chair
              <svg
                class="ml-1 w-4 h-4 transform group-hover:rotate-180 transition-transform duration-200"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <ul
              class="absolute left-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20 min-w-[160px]
                     opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100
                     transition-all duration-200 ease-out
                     pointer-events-none group-hover:pointer-events-auto"
            >
              <li><RouterLink to="/chair/reviewers" class="block px-4 py-2 text-sm hover:bg-gray-800 hover:text-yellow-400 transition">Manage Reviewers</RouterLink></li>
              <li><RouterLink to="/chair/assign" class="block px-4 py-2 text-sm hover:bg-gray-800 hover:text-yellow-400 transition">Assign Papers</RouterLink></li>
            </ul>
          </li>

          <!-- Reviewer Dropdown -->
          <li v-if="user?.roles?.includes('reviewer')" class="relative group">
            <span
              class="hover:text-yellow-400 cursor-pointer transition-colors duration-200 flex items-center px-2 py-1"
            >
              Tasks
              <svg
                class="ml-1 w-4 h-4 transform group-hover:rotate-180 transition-transform duration-200"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <ul
              class="absolute left-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20 min-w-[160px]
                     opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100
                     transition-all duration-200 ease-out
                     pointer-events-none group-hover:pointer-events-auto"
            >
              <li><RouterLink to="/tasks/assigned" class="block px-4 py-2 text-sm hover:bg-gray-800 hover:text-yellow-400 transition">Assigned Papers</RouterLink></li>
            </ul>
          </li>

          <!-- Logout -->
          <li>
            <button
              @click="logout"
              class="text-sm text-red-400 hover:text-red-500 transition-colors duration-200"
            >
              Logout
            </button>
          </li>
        </template>
      </ul>
    </div>
  </nav>
</template>

<script setup>
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ref, watch } from "vue";
import axios from "axios";

const route = useRoute();
const router = useRouter();
const user = ref(null);

async function fetchMe() {
  try {
    const { data } = await axios.get("/auth/me");
    user.value = data?.user || null;
  } catch {
    user.value = null;
  }
}

async function logout() {
  try {
    await axios.post("/auth/logout");
  } catch {}
  user.value = null;
  router.push("/login");
}

watch(() => route.fullPath, fetchMe, { immediate: true });
</script>
