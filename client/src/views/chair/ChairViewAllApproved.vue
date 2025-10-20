<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4 flex justify-center">
    <div class="w-full max-w-6xl bg-white shadow-xl rounded-2xl p-8">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Chair — Approved Papers</h1>
        <button
          class="text-sm text-red-500 hover:underline font-medium"
          @click="logout"
        >
          Logout
        </button>
      </div>

      <!-- Search -->
      <div class="flex items-center gap-3 mb-8">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by event or paper title..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          ✕ Clear
        </button>
      </div>

      <!-- Event List -->
      <div v-if="filteredEvents.length">
        <div
          v-for="event in filteredEvents"
          :key="event.event_id"
          class="mb-12 border-b border-gray-200 pb-8"
        >
          <h2 class="text-2xl font-semibold text-indigo-700 mb-6">
            {{ event.event_name }}
          </h2>

          <!-- Paper List -->
          <div
            v-for="paper in event.papers"
            :key="paper.id"
            class="bg-white border border-gray-200 rounded-xl shadow-sm mb-5 hover:shadow-md transition"
          >
            <div class="p-6 flex flex-col md:flex-row justify-between md:items-center">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 mb-1">
                  {{ paper.title }}
                </h3>
                    <p class="text-sm text-gray-600 mb-1">
                    <strong>Authors: </strong>
                    <span>
                        {{
                        Array.isArray(paper.authors)
                            ? paper.authors.map(a => a.name || a.email).join(", ")
                            : paper.authors || "—"
                        }}
                    </span>
                    </p>
                <span
                  class="inline-block bg-green-100 text-green-700 border border-green-200 text-xs font-semibold rounded-full px-2 py-0.5 mt-1"
                >
                  Approved
                </span>
              </div>

              <div class="mt-4 md:mt-0">
                <a
                  :href="`${API_BASE}/${paper.file_path}`"
                  target="_blank"
                  class="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 transition"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                    />
                  </svg>
                  Download PDF
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-else class="text-gray-500 text-center mt-12 text-lg italic">
        No approved papers found.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import axios from "axios";
import { useRouter } from "vue-router";

const router = useRouter();
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const events = ref([]);
const searchQuery = ref("");

// Load approved submissions for all events
onMounted(async () => {
  try {
    const { data } = await axios.get("/chair/approved-submissions", {
      withCredentials: true,
    });
    events.value = data.items || data; // adapt to backend structure
  } catch (e) {
    console.error("Failed to fetch approved submissions:", e);
  }
});

// Computed search filter
const filteredEvents = computed(() => {
  if (!searchQuery.value.trim()) return events.value;

  const q = searchQuery.value.toLowerCase();
  return events.value
    .map((ev) => ({
      ...ev,
      papers: ev.papers.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          ev.event_name.toLowerCase().includes(q)
      ),
    }))
    .filter((ev) => ev.papers.length > 0);
});

async function logout() {
  try {
    await axios.post("/auth/logout");
    router.push("/login");
  } catch {}
}
</script>

<style scoped>
a[target="_blank"] {
  text-decoration: none;
}
</style>
