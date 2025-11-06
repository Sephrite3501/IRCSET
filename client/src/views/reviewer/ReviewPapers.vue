<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 flex flex-col items-center">
    <!-- Page Header -->
    <h1 class="text-3xl font-bold text-gray-900 mb-10">Reviewer — Assigned Papers</h1>

    <!-- Events Container -->
    <div class="w-11/12 max-w-6xl space-y-6">
      <div
        v-for="event in events"
        :key="event.id"
        class="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden transition hover:shadow-lg"
      >
        <!-- Event Header -->
        <div
          class="flex justify-between items-center px-6 py-5 cursor-pointer bg-gray-50 hover:bg-gray-100 transition"
          @click="toggleEvent(event.id)"
        >
          <div>
            <h2 class="text-lg font-semibold text-gray-900">
              {{ event.name }}
              <span class="text-gray-500 font-normal">({{ event.year || "—" }})</span>
            </h2>
            <p v-if="event.description" class="text-sm text-gray-500 mt-0.5 line-clamp-1">
              {{ event.description }}
            </p>
          </div>

          <div class="flex items-center gap-3">
            <!-- Paper count badge -->
            <span
              class="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full"
            >
              {{ event.assignmentCount ?? "—" }} papers
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

        <!-- Expanded Paper List -->
        <transition name="fade">
          <div
            v-if="expandedEvents.has(event.id)"
            class="border-t border-gray-200 bg-white px-6 py-5"
          >
            <div v-if="loadingEventId === event.id" class="text-gray-400 italic py-3">
              Loading papers...
            </div>

            <div
              v-else-if="getAssignments(event.id).length === 0"
              class="text-gray-500 italic py-3 text-center"
            >
              No papers assigned for this event.
            </div>

            <div v-else class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
              <table class="min-w-full text-sm text-gray-700 border-collapse">
                <thead class="bg-gray-100 border-b border-gray-200 text-gray-700 font-semibold">
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
                    class="border-b hover:bg-slate-50 transition"
                  >
                    <!-- Title -->
                    <td class="p-3 font-medium text-gray-900">
                      {{ paper.title }}
                    </td>

                    <!-- Status -->
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

                    <!-- Review Status -->
                    <td class="p-3">
                      <span
                        :class="[
                          'px-2 py-1 rounded text-xs font-semibold capitalize',
                          paper.review_status === 'submitted'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        ]"
                      >
                        {{ paper.review_status || 'pending' }}
                      </span>
                    </td>

                    <!-- Assigned Date -->
                    <td class="p-3 text-gray-600">{{ formatDate(paper.assigned_at) }}</td>

                    <!-- Due Date -->
                    <td class="p-3 text-gray-600">{{ formatDate(paper.due_at) }}</td>

                    <!-- Action -->
                    <td class="p-3 text-center">
                      <RouterLink
                        :to="toReviewLink(event.id, paper.id)"
                        class="font-medium inline-block px-3 py-1.5 rounded-md transition"
                        :class="paper.review_status === 'submitted'
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'"
                      >
                        {{ paper.review_status === 'submitted' ? 'Edit Review' : 'Review' }}
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

/** Strip control chars and angle brackets; clamp length. Safe for display. */
function cleanText(input, max = 2000) {
  return String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

/** Accept only positive integer-ish IDs (string or number). Return null if bad. */
function toSafeId(v) {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return String(v);
  if (typeof v === "string" && /^[1-9]\d*$/.test(v)) return v;
  return null;
}

/** Safely coerce an event object coming from API. */
function coerceEvent(raw) {
  const id = toSafeId(raw?.id);
  return id
    ? {
        id,
        name: cleanText(raw?.name, 120),
        year: cleanText(raw?.year ?? "", 10),
        description: cleanText(raw?.description ?? "", 500),
      }
    : null;
}

/** Safely coerce a paper/assignment row. */
function coercePaper(raw) {
  const id = toSafeId(raw?.id);
  if (!id) return null;
  const status = cleanText(raw?.status ?? "", 40);
  const review_status = cleanText(raw?.review_status ?? "", 40);
  const assigned_at = raw?.assigned_at ? String(raw.assigned_at) : null;
  const due_at = raw?.due_at ? String(raw.due_at) : null;

  return {
    id,
    title: cleanText(raw?.title ?? "Untitled", 300),
    status,
    review_status,
    assigned_at,
    due_at,
  };
}

/** Build the review route path safely. Falls back to “#” if invalid. */
function toReviewLink(eventId, paperId) {
  const e = toSafeId(eventId);
  const p = toSafeId(paperId);
  return e && p ? `/review/${encodeURIComponent(e)}/${encodeURIComponent(p)}` : "#";
}

// 1️⃣ Fetch all events and their paper counts
async function fetchReviewerEvents() {
  try {
    const res = await api.get("/reviewer/events", { withCredentials: true });
    const rawEvents = res.data?.items || [];
    // sanitize + drop invalid
    events.value = rawEvents.map(coerceEvent).filter(Boolean);

    // Prefetch counts for each event
    for (const ev of events.value) {
      try {
        const countRes = await api.get(`/reviewer/events/${ev.id}/reviewer/assignments`, {
          withCredentials: true,
        });
        const rows = (countRes.data?.items || [])
          .map(coercePaper)
          .filter(Boolean);

        ev.assignmentCount = rows.length;
        assignmentsMap.value[ev.id] = []; // defer storing full list until expanded
      } catch {
        ev.assignmentCount = "—";
        assignmentsMap.value[ev.id] = [];
      }
    }
  } catch (e) {
    console.error("Failed to fetch reviewer events", e);
    events.value = [];
  }
}


async function toggleEvent(eventId) {
  const safeId = toSafeId(eventId);
  if (!safeId) return;

  if (expandedEvents.value.has(safeId)) {
    expandedEvents.value.delete(safeId);
    return;
  }

  expandedEvents.value.add(safeId);

  if (!assignmentsMap.value[safeId]?.length) {
    loadingEventId.value = safeId;
    try {
      const res = await api.get(`/reviewer/events/${safeId}/reviewer/assignments`, {
        withCredentials: true,
      });
      assignmentsMap.value[safeId] = (res.data?.items || [])
        .map(coercePaper)
        .filter(Boolean);
    } catch (e) {
      console.error("Error loading assignments", e);
      assignmentsMap.value[safeId] = [];
    } finally {
      loadingEventId.value = null;
    }
  }
}


function getAssignments(eventId) {
  const safeId = toSafeId(eventId);
  return (safeId && assignmentsMap.value[safeId]) || [];
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
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
