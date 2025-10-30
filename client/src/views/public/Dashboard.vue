<script setup>
import axios from "axios";
import { ref, onMounted, computed } from "vue";
import { useRouter, RouterLink } from "vue-router";

const router = useRouter();
const user = ref(null);
const loading = ref(true);
const submissions = ref([]);
const tasks = ref([]);
const nextDeadline = ref(null);

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3005";

onMounted(async () => {
  try {
    // 1) use an axios instance with base + credentials
    const api = axios.create({
      baseURL: API_BASE,
      withCredentials: true,
    });

    // 2) first, make sure we have the csrf cookie (your app.js issuesCsrf)
    await api.get("/auth/csrf-token");

    // 3) now get the current user
    const { data } = await api.get("/auth/me");
    user.value = data?.user || null;

    if (!user.value) {
      router.push("/login");
      return;
    }

    // 4) fetch user papers
    const res1 = await api.get("/users/mypapers");
    submissions.value =
      res1.data?.events?.flatMap((ev) => ev.papers || []) || [];
  } catch (err) {
    console.error("Dashboard load failed:", err);
    router.push("/login");
  } finally {
    loading.value = false;
  }
});

async function logout() {
  try {
    const api = axios.create({
      baseURL: API_BASE,
      withCredentials: true,
    });
    await api.post("/auth/logout");
  } finally {
    router.push("/login");
  }
}

// Progress summary (for reviewers)
const reviewProgress = computed(() => {
  if (!tasks.value.length) return 0;
  const completed = tasks.value.filter(t => t.review_status === "submitted").length;
  return Math.round((completed / tasks.value.length) * 100);
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 py-10 px-6">
    <div
      class="max-w-6xl mx-auto bg-white border border-slate-200 shadow-lg rounded-2xl p-8"
    >
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Welcome back 👋</h1>
          <p class="text-gray-500">
            {{ user?.name || "User" }},
            signed in as
            <span
              v-if="user?.roles?.length"
              class="ml-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full"
            >
              {{ user.roles.join(", ") }}
            </span>
          </p>
        </div>
        <button
          @click="logout"
          class="text-sm font-medium text-red-600 hover:text-red-700"
        >
          Logout
        </button>
      </div>

      <!-- Quick Overview Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
          <p class="text-sm text-gray-500 mb-1">My Papers</p>
          <p class="text-2xl font-semibold text-indigo-700">
            {{ submissions.length }}
          </p>
          <RouterLink
            to="/"
            class="text-xs text-indigo-600 hover:text-indigo-800 mt-1 inline-block"
          >
            View My Papers →
          </RouterLink>
        </div>

        <div
          v-if="user?.roles?.includes('reviewer')"
          class="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm"
        >
          <p class="text-sm text-gray-500 mb-1">Pending Reviews</p>
          <p class="text-2xl font-semibold text-indigo-700">
            {{ tasks.filter(t => t.review_status !== 'submitted').length }}
          </p>
          <RouterLink
            to="/tasks/assigned"
            class="text-xs text-indigo-600 hover:text-indigo-800 mt-1 inline-block"
          >
            View Tasks →
          </RouterLink>
        </div>

        <div
          v-if="user?.roles?.includes('chair')"
          class="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm"
        >
          <p class="text-sm text-gray-500 mb-1">Events Managed</p>
          <p class="text-2xl font-semibold text-indigo-700">
            {{ user?.events_count || 0 }}
          </p>
          <RouterLink
            to="/chair/assign"
            class="text-xs text-indigo-600 hover:text-indigo-800 mt-1 inline-block"
          >
            Manage Events →
          </RouterLink>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
          <p class="text-sm text-gray-500 mb-1">Next Deadline</p>
          <p class="text-lg font-semibold text-indigo-700">
            {{
              nextDeadline
                ? new Date(nextDeadline).toLocaleDateString()
                : "No upcoming"
            }}
          </p>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-6 border-t pt-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">
          Quick Actions
        </h2>
        <div class="flex flex-wrap gap-3">
          <RouterLink
            to="/submission"
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
          >
            ➕ Submit a Paper
          </RouterLink>

          <RouterLink
            to="/tasks/assigned"
            v-if="user?.roles?.includes('reviewer')"
            class="px-4 py-2 bg-slate-100 border rounded-md hover:bg-slate-200 transition"
          >
            🧾 Review Tasks
          </RouterLink>

          <RouterLink
            to="/chair/assign"
            v-if="user?.roles?.includes('chair')"
            class="px-4 py-2 bg-slate-100 border rounded-md hover:bg-slate-200 transition"
          >
            ⚙️ Manage Assignments
          </RouterLink>

          <RouterLink
            to="/admin/events"
            v-if="user?.is_admin"
            class="px-4 py-2 bg-slate-100 border rounded-md hover:bg-slate-200 transition"
          >
            🏛 Admin Events
          </RouterLink>
        </div>
      </div>

      <!-- Reviewer Progress -->
      <div
        v-if="user?.roles?.includes('reviewer') && tasks.length"
        class="mt-10 border-t pt-6"
      >
        <h2 class="text-lg font-semibold text-gray-800 mb-3">
          Review Progress
        </h2>
        <div class="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
          <div
            class="h-full bg-indigo-600 transition-all duration-500"
            :style="{ width: reviewProgress + '%' }"
          ></div>
        </div>
        <p class="text-sm text-gray-500">
          {{ reviewProgress }}% of your assigned reviews completed
        </p>
      </div>

      <!-- Empty State -->
      <div
        v-if="!submissions.length && !tasks.length && !loading"
        class="text-center py-10 text-gray-500"
      >
        <p>No activity yet.</p>
        <RouterLink
          to="/submission"
          class="mt-2 inline-block text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Submit your first paper →
        </RouterLink>
      </div>
    </div>
  </div>
</template>
