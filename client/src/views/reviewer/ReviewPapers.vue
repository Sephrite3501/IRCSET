<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center py-12">
    <h1 class="text-2xl font-semibold text-gray-800 mb-8">Reviewer — Assigned Papers</h1>

    <!-- Events list -->
    <div class="w-11/12 max-w-5xl space-y-6">
      <div
        v-for="event in events"
        :key="event.id"
        class="bg-white shadow rounded-lg overflow-hidden border border-gray-200 transition"
      >
        <!-- Event header -->
        <div
          class="flex justify-between items-center px-6 py-4 cursor-pointer hover:bg-gray-50"
          @click="toggleEvent(event.id)"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-gray-800">
              {{ event.name }} <span class="text-gray-500">({{ event.year || '—' }})</span>
            </h2>
          </div>

          <div class="flex items-center gap-3">
            <!-- Paper count badge -->
            <span
              class="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full"
            >
              {{ event.assignmentCount ?? '—' }}
            </span>

            <!-- Expand icon -->
            <svg
              :class="[
                'w-5 h-5 text-gray-500 transition-transform duration-300',
                expandedEvents.has(event.id) ? 'rotate-180' : ''
              ]"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <!-- Expanded paper list -->
        <transition name="fade">
          <div
            v-if="expandedEvents.has(event.id)"
            class="border-t border-gray-200 bg-gray-50 px-6 py-4"
          >
            <div v-if="loadingEventId === event.id" class="text-gray-400 italic">Loading...</div>

            <div v-else-if="getAssignments(event.id).length === 0" class="text-gray-500 italic">
              No papers assigned.
            </div>

            <div v-else class="overflow-x-auto">
              <table class="min-w-full text-sm text-gray-700 border-collapse">
                <thead class="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th class="p-3 text-left">Title</th>
                    <th class="p-3 text-left">Status</th>
                    <th class="p-3 text-left">Review Status</th>
                    <th class="p-3 text-left">Assigned</th>
                    <th class="p-3 text-left">Due</th>
                    <th class="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="paper in getAssignments(event.id)"
                    :key="paper.id"
                    class="border-b hover:bg-gray-100 transition"
                  >
                    <td class="p-3 font-medium">{{ paper.title }}</td>
                    <td class="p-3">
                      <span
                        :class="[
                          'px-2 py-1 rounded text-xs font-semibold',
                          paper.status === 'submitted'
                            ? 'bg-blue-100 text-blue-700'
                            : paper.status === 'under_review'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                        ]"
                      >
                        {{ paper.status }}
                      </span>
                    </td>
                    <td class="p-3">
                      <span
                        :class="[
                          'px-2 py-1 rounded text-xs font-semibold',
                          paper.review_status === 'submitted'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        ]"
                      >
                        {{ paper.review_status || 'pending' }}
                      </span>
                    </td>
                    <td class="p-3">{{ formatDate(paper.assigned_at) }}</td>
                    <td class="p-3">{{ formatDate(paper.due_at) }}</td>
                    <td class="p-3 text-center">
                    <RouterLink
                    :to="`/review/${event.id}/${paper.id}`"
                    class="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                    Review
                    </RouterLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { RouterLink } from "vue-router";
import axios from "axios";

const events = ref([]);
const assignmentsMap = ref({});
const expandedEvents = ref(new Set());
const loadingEventId = ref(null);

onMounted(fetchReviewerEvents);

// 1️⃣ Fetch all events and their paper counts
async function fetchReviewerEvents() {
  try {
    const res = await axios.get("/reviewer/events", { withCredentials: true });
    events.value = res.data.items || [];

    // Prefetch counts for each event
    for (const ev of events.value) {
      try {
        const countRes = await axios.get(
          `/reviewer/events/${ev.id}/reviewer/assignments`,
          { withCredentials: true }
        );
        const papers = countRes.data.items || [];
        ev.assignmentCount = papers.length;
        assignmentsMap.value[ev.id] = []; // store empty until expanded
      } catch {
        ev.assignmentCount = "—";
      }
    }
  } catch (e) {
    console.error("Failed to fetch reviewer events", e);
  }
}

async function toggleEvent(eventId) {
  if (expandedEvents.value.has(eventId)) {
    expandedEvents.value.delete(eventId);
    return;
  }

  expandedEvents.value.add(eventId);

  if (!assignmentsMap.value[eventId]?.length) {
    loadingEventId.value = eventId;
    try {
      const res = await axios.get(
        `/reviewer/events/${eventId}/reviewer/assignments`,
        { withCredentials: true }
      );
      assignmentsMap.value[eventId] = res.data.items || [];
    } catch (e) {
      console.error("Error loading assignments", e);
      assignmentsMap.value[eventId] = [];
    } finally {
      loadingEventId.value = null;
    }
  }
}

function getAssignments(eventId) {
  return assignmentsMap.value[eventId] || [];
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
