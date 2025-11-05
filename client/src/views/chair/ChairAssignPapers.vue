<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10">
    <div class="max-w-7xl mx-auto px-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-10">
        <h1 class="text-3xl font-bold text-gray-900">
          Chair — Assign Reviewers
        </h1>
        <button class="text-sm text-red-500 font-medium hover:underline" @click="logout">
          Logout
        </button>
      </div>

      <!-- Error Banner -->
      <div v-if="errorMsg" class="mb-6 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
        {{ errorMsg }}
      </div>

      <!-- Search -->
      <div class="mb-6 flex items-center gap-3">
        <input
          v-model="searchQGlobal"
          type="text"
          placeholder="Search submissions by title..."
          class="flex-1 border rounded-md px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-400"
        />
        <button
          v-if="searchQGlobal"
          @click="searchQGlobal = ''"
          class="text-sm text-gray-500 hover:text-gray-700"
        >
          ✕ Clear
        </button>
      </div>

      <!-- Main Container -->
      <div class="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
        <!-- Header: My Events + View Approved Papers -->
        <div class="flex items-center justify-between mb-6 border-b pb-3">
          <h2 class="text-xl font-semibold text-gray-800">
            My Events
          </h2>

          <RouterLink
            to="/chair/approved-papers"
            class="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            View All Approved Papers
          </RouterLink>
        </div>

        <div v-if="!events.length" class="text-gray-500 italic mb-6">
          You are not assigned as chair in any event.
        </div>

        <!-- Events -->
        <div v-for="ev in events" :key="ev.id" class="mb-8">
          <div class="rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors duration-150 shadow-sm">
            <button @click="toggleEvent(ev.id)" class="w-full flex justify-between items-center text-left p-5 focus:outline-none">
              <div>
                <div class="font-semibold text-gray-900 text-lg">{{ ev.name }}</div>
                <div class="text-sm text-gray-500">
                  {{ ev.description || "—" }}
                  <span v-if="ev.start_date || ev.end_date" class="ml-1">
                    ({{ ev.start_date || "…" }} → {{ ev.end_date || "…" }})
                  </span>
                </div>
              </div>
              <div class="text-xs text-gray-600 bg-white border rounded-md px-3 py-1 shadow-sm">
                {{ (submissionsByEvent[ev.id]?.length || 0) }} submission(s)
              </div>
            </button>

            <!-- Event quick stats + sort -->
            <div class="px-6 pb-3 flex items-center gap-3">
              <div class="text-sm text-gray-600">
                Overall Avg Score:
                <span class="font-medium text-indigo-700">{{ eventAvgScore(ev.id) }}</span>
              </div>

              <button
                class="ml-auto text-xs px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
                @click="toggleEventSort(ev.id)"
                :title="subSortAscByEvent[ev.id] ? 'Ascending' : 'Descending'"
              >
                Sort papers by Avg Score {{ subSortAscByEvent[ev.id] ? '↑' : '↓' }}
              </button>
            </div>

            <!-- Expanded Panel -->
            <transition name="fade">
              <div v-if="openEventId === ev.id" class="px-6 pb-8 bg-white border-t border-gray-200 rounded-b-xl">
                <div v-if="filteredSubmissions(ev.id).length" class="divide-y divide-gray-200">
                  <!-- Submissions -->
                  <div v-for="sub in filteredSubmissions(ev.id)" :key="sub.id" class="py-6">
                    <!-- Paper Header -->
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <h3 class="font-semibold text-gray-900 flex items-center gap-3">
                          {{ sub.title }}
                          <span class="text-xs font-medium px-2 py-0.5 rounded"
                            :class="{
                              'bg-green-100 text-green-700': sub.status === 'approved',
                              'bg-red-100 text-red-700': sub.status === 'rejected',
                              'bg-gray-100 text-gray-700': !['approved', 'rejected'].includes(sub.status)
                            }"
                          >
                            {{ sub.status }}
                          </span>
                        </h3>
                        <p class="text-xs text-gray-500 mt-1">
                          <b>Assigned:</b> {{ sub.n_assigned }} •
                          <b>Reviews:</b> {{ sub.n_submitted }} •
                          <b>Avg Score:</b>
                          <span class="text-indigo-600">{{ formatScore(sub.avg_score) }}</span>
                        </p>
                      </div>

                      <!-- Approve / Reject -->
                      <div class="flex gap-2 mt-2 md:mt-0">
                        <button @click="updateStatus(ev.id, sub.id, 'approved')"
                          class="px-3 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                          :disabled="loading || sub.n_submitted < sub.n_assigned">
                          Approve
                        </button>

                        <button @click="updateStatus(ev.id, sub.id, 'rejected')"
                          class="px-3 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                          :disabled="loading || sub.n_submitted < sub.n_assigned">
                          Reject
                        </button>
                      </div>
                    </div>

                    <!-- Current Reviewers -->
                    <div class="mt-4">
                      <h4 class="text-sm font-semibold text-gray-700 mb-1 border-b border-gray-200 pb-1 flex items-center">
                        <span>Current Reviewers</span>
                        <button
                          class="ml-auto text-xs px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300"
                          @click="toggleReviewerSort(ev.id, sub.id)"
                          :title="revSortAscBySub[sub.id] ? 'Ascending' : 'Descending'"
                        >
                          Sort by Score {{ revSortAscBySub[sub.id] ? '↑' : '↓' }}
                        </button>
                      </h4>

                      <div class="bg-slate-50 border border-gray-200 rounded-lg overflow-hidden">
                        <div v-if="!assignmentsBySub[sub.id]?.length" class="p-4 text-gray-500 text-sm italic">
                          None assigned yet.
                        </div>

                        <div v-else class="divide-y">
                          <div
                            v-for="a in sortedAssignments(sub.id)"
                            :key="a.reviewer_id"
                            class="px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                          >
                            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div>
                                <p class="text-sm font-medium text-gray-800">{{ a.name || a.email }}</p>
                                <p class="text-xs text-gray-500">
                                  Review status: {{ a.review_status || "—" }}
                                  <span v-if="a.due_at">• due {{ fmt(a.due_at) }}</span>
                                </p>
                              </div>

                              <div class="flex gap-3 text-xs">
                                <button class="text-indigo-600 hover:underline" @click="toggleReviewDropdown(sub.id, a.reviewer_id)">
                                  {{ expandedReviews[sub.id]?.has(a.reviewer_id) ? "Hide" : "Show" }} Review
                                </button>
                                <button class="text-red-500 hover:underline" :disabled="loading" @click="unassignOne(ev.id, sub.id, a.reviewer_id)">
                                  Remove
                                </button>
                              </div>
                            </div>

                            <!-- Review Dropdown -->
                            <transition name="fade">
                              <div
                                v-if="expandedReviews[sub.id]?.has(a.reviewer_id)"
                                class="mt-4 p-4 bg-slate-50 border border-gray-200 rounded-lg"
                              >
                                <div v-if="!reviewsBySub[sub.id]?.[a.reviewer_id]">
                                  <button class="text-xs text-indigo-600 underline" @click="loadAllReviews(ev.id, sub.id)">
                                    Load review
                                  </button>
                                </div>

                                <div v-else class="bg-white border rounded-lg p-5 mt-2 shadow-sm">
                                  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                                    <div v-for="metric in ['Technical', 'Relevance', 'Innovation', 'Writing']"
                                      :key="metric"
                                      class="text-center border rounded-lg p-3 bg-slate-50"
                                    >
                                      <p class="text-xs text-gray-500 uppercase tracking-wide">{{ metric }}</p>
                                      <p class="text-lg font-semibold text-gray-800">
                                        {{ reviewsBySub[sub.id][a.reviewer_id]['score_' + metric.toLowerCase()] ?? "—" }}
                                      </p>
                                    </div>
                                  </div>

                                  <div class="text-center mb-5">
                                    <p class="text-sm font-medium text-gray-600">Overall Score</p>
                                    <p class="text-3xl font-bold text-indigo-700">
                                      {{ reviewsBySub[sub.id][a.reviewer_id].score_overall ?? "—" }}
                                    </p>
                                  </div>

                                  <div class="flex flex-col gap-5 mt-4">
                                    <div>
                                      <label class="text-sm font-semibold text-gray-700 block mb-1">
                                        Comments for Author
                                      </label>
                                      <div
                                        class="border border-gray-200 bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-line h-28 overflow-y-auto"
                                      >
                                        {{ reviewsBySub[sub.id][a.reviewer_id].comments_for_author || "—" }}
                                      </div>
                                    </div>

                                    <div>
                                      <label class="text-sm font-semibold text-gray-700 block mb-1">
                                        Comments for Committee
                                      </label>
                                      <div
                                        class="border border-gray-200 bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-line h-28 overflow-y-auto"
                                      >
                                        {{ reviewsBySub[sub.id][a.reviewer_id].comments_committee || "—" }}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </transition>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- External Reviews (Collapsible) -->
                    <div v-if="Object.values(reviewsBySub[sub.id] || {}).some(r => r.is_external)" class="mt-6">
                      <h4 class="text-sm font-semibold text-gray-700 mb-1 border-b border-gray-200 pb-1 flex items-center justify-between">
                        <span>External Reviewers</span>
                        <button
                          class="text-xs text-indigo-600 hover:underline"
                          @click="toggleExternalReviews(sub.id)"
                        >
                          {{
                            expandedExternalReviews[sub.id]
                              ? 'Hide Reviews'
                              : `Show Reviews (${Object.values(reviewsBySub[sub.id] || {}).filter(r => r.is_external).length})`
                          }}
                        </button>
                      </h4>

                      <transition name="fade">
                        <div v-if="expandedExternalReviews[sub.id]" class="divide-y divide-gray-200 mt-2">
                          <div
                            v-for="r in Object.values(reviewsBySub[sub.id] || {}).filter(rr => rr.is_external)"
                            :key="r.external_reviewer_id"
                            class="py-4"
                          >
                            <p class="font-medium text-gray-900">
                              {{ r.reviewer_name }}
                              <span class="text-xs text-gray-500">(External)</span>
                            </p>
                            <p class="text-xs text-gray-500 mb-2">
                              Submitted at: {{ fmt(r.submitted_at) || '—' }}
                            </p>

                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              <div
                                v-for="metric in ['technical', 'relevance', 'innovation', 'writing']"
                                :key="metric"
                                class="text-center border rounded-lg p-2 bg-slate-50"
                              >
                                <p class="text-xs text-gray-500 uppercase">{{ metric }}</p>
                                <p class="font-semibold">{{ r['score_' + metric] ?? '—' }}</p>
                              </div>
                            </div>

                            <div class="text-sm text-gray-700 mb-2">
                              <strong>Overall:</strong> {{ r.score_overall ?? '—' }}
                            </div>

                            <div class="text-sm text-gray-800 whitespace-pre-line bg-gray-50 border rounded-lg p-3 mb-3">
                              <strong>Comments for Author:</strong><br />
                              {{ r.comments_for_author || '—' }}
                            </div>

                            <div class="text-sm text-gray-800 whitespace-pre-line bg-gray-50 border rounded-lg p-3">
                              <strong>Comments for Committee:</strong><br />
                              {{ r.comments_committee || '—' }}
                            </div>
                          </div>
                        </div>
                      </transition>
                    </div>
                    <div v-else class="mt-6">
                      <h4 class="text-sm font-semibold text-gray-700 mb-1 border-b border-gray-200 pb-1">
                        External Reviewers
                      </h4>
                      <p class="text-gray-500 italic text-sm">No external reviews submitted yet.</p>
                    </div>

                    <!-- Assign Reviewers -->
                    <div class="mt-6">
                      <h4 class="text-sm font-semibold text-gray-700 mb-1">Add Reviewers</h4>
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2 items-start">
                        <div class="md:col-span-2">
                          <input v-model="searchQBySub[sub.id]" placeholder="Search reviewers by name or email..."
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" />
                          <div class="mt-2 max-h-48 overflow-auto bg-white border border-gray-200 rounded-lg shadow-sm">
                            <button v-for="u in filteredReviewerPool(ev.id, sub.id)" :key="u.id"
                              class="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition border-b last:border-0"
                              :class="{ 'bg-indigo-100': (selectedToAddBySub[sub.id]?.has(u.id) || false) }"
                              @click="toggleSelect(sub.id, u.id)">
                              <div class="font-medium">{{ u.name || u.email }}</div>
                              <div class="text-xs text-gray-500">{{ u.email }}</div>
                            </button>
                            <div v-if="(searchQBySub[sub.id] || '') && filteredReviewerPool(ev.id, sub.id).length === 0"
                              class="p-3 text-sm text-gray-500 italic">No matching reviewers found.</div>
                          </div>
                        </div>
                        <div>
                          <label class="text-xs text-gray-600 block mb-1 font-medium">Optional due date</label>
                          <input v-model="dueDateBySub[sub.id]" type="date"
                            class="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                          <button class="mt-3 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm w-full font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
                            :disabled="!(selectedToAddBySub[sub.id]?.size) || loading" @click="assignSelected(ev.id, sub.id)">
                            {{ loading ? 'Assigning…' : 'Assign Selected' }}
                          </button>
                        </div>
                      </div>
                      <div class="flex justify-end mb-4">
                        <button @click="openExternalModal(sub.id)"
                          class="mt-3 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm w-full font-medium hover:bg-indigo-700">
                          + Add External Reviewer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-else class="text-gray-500 italic mt-6 text-sm text-center border-t pt-4">
                  No submissions in this event yet.
                </p>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- External Reviewer Modal -->
  <transition name="fade">
    <div v-if="showExternalModal" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg relative">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Add External Reviewer</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input v-model="extName" type="text"
              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              placeholder="Reviewer name" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
            <input v-model="extEmail" type="email"
              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              placeholder="email@example.com" />
          </div>
          <div class="flex justify-end gap-3 pt-4 border-t">
            <button @click="showExternalModal = false" class="px-3 py-2 rounded-md text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button @click="submitExternalReviewer" :disabled="extSubmitting"
              class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-60">
              {{ extSubmitting ? "Generating..." : "Generate Link" }}
            </button>
          </div>
        </div>
        <div v-if="generatedLink" class="mt-5 p-3 bg-green-50 border border-green-200 rounded-md">
          <p class="text-sm text-green-700 font-medium mb-1">✅ Reviewer Added</p>
          <p class="text-xs text-gray-700">
            Share this link manually:<br />
            <a 
              :href="generatedLink"
              target="_blank"
              class="text-indigo-600 font-medium break-all"
            >
              {{ generatedLink }}
            </a>
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import axios from "axios";
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const loading = ref(false);
const errorMsg = ref("");
const events = ref([]);
const openEventId = ref(null);
const reviewerPoolByEvent = ref({});
const submissionsByEvent = ref({});
const assignmentsBySub = ref({});
const searchQBySub = ref({});
const selectedToAddBySub = ref({});
const dueDateBySub = ref({});
const expandedReviews = ref({});
const reviewsBySub = ref({});
const searchQGlobal = ref("");

// NEW: sort state
const subSortAscByEvent = ref({}); // { [eventId]: boolean }
const revSortAscBySub   = ref({}); // { [subId]: boolean }

// External reviewer modal
const showExternalModal = ref(false);
const extName = ref("");
const extEmail = ref("");
const generatedLink = ref("");
const extSubmitting = ref(false);
const targetSubmissionId = ref(null);

function openExternalModal(submissionId) {
  targetSubmissionId.value = submissionId;
  showExternalModal.value = true;
}

onMounted(async () => {
  try {
    const { data } = await axios.get("/auth/me");
    if (!data?.user) return router.push("/login");
  } catch {
    return router.push("/login");
  }
  await loadMyEvents();
});

// --- Data Loading ---
async function loadMyEvents() {
  try {
    const { data } = await axios.get("/chair/my-events");
    events.value = data?.items || [];
    if (events.value.length) {
      openEventId.value = events.value[0].id;
      await loadEventData(openEventId.value);
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.error || "Failed to load events";
  }
}

async function toggleEvent(eventId) {
  if (openEventId.value === eventId) {
    openEventId.value = null;
  } else {
    openEventId.value = eventId;
    await loadEventData(eventId);
  }
}

async function loadEventData(eventId) {
  await Promise.all([loadReviewerPool(eventId), loadSubmissions(eventId)]);
  const subs = submissionsByEvent.value[eventId] || [];
  await Promise.all(subs.map((s) => loadAssignments(eventId, s.id)));
  await Promise.all(subs.map((s) => loadExternalReviews(eventId, s.id)));
}

async function loadReviewerPool(eventId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/reviewers`);
    reviewerPoolByEvent.value[eventId] = (data?.items || []).map((r) => ({
      id: r.user_id || r.id,
      email: r.email,
      name: r.name,
    }));
  } catch {
    reviewerPoolByEvent.value[eventId] = [];
  }
}

async function loadSubmissions(eventId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/submissions`, {
      params: { limit: 100 },
    });
    submissionsByEvent.value[eventId] = data?.items || [];
  } catch {
    submissionsByEvent.value[eventId] = [];
  }
}

async function loadAssignments(eventId, subId) {
  try {
    const { data } = await axios.get(
      `/chair/${eventId}/submissions/${subId}/assignments`
    );
    assignmentsBySub.value[subId] = data?.items || [];
  } catch {
    assignmentsBySub.value[subId] = [];
  }
  await loadAllReviews(eventId, subId);
}

async function loadAllReviews(eventId, subId) {
  try {
    const { data } = await axios.get(
      `/chair/${eventId}/submissions/${subId}/reviews`
    );
    reviewsBySub.value[subId] = {};
    for (const r of data.items) {
      const key = r.reviewer_user_id || r.external_reviewer_id;
      reviewsBySub.value[subId][key] = r;
    }
  } catch (e) {
    console.error("Failed to load reviews:", e);
  }
}

async function loadExternalReviews(eventId, subId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/submissions/${subId}/external-reviews`);
    for (const r of data.items) {
      const key = r.external_reviewer_id;
      if (!reviewsBySub.value[subId]) reviewsBySub.value[subId] = {};
      reviewsBySub.value[subId][key] = r;
    }
  } catch (e) {
    console.error("❌ Failed to load external reviews:", e);
  }
}

// --- Utilities & UI helpers ---
function fmt(dt) {
  try { return new Date(dt).toLocaleDateString(); } catch { return dt; }
}
function formatScore(n) {
  if (n == null) return "—";
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

// NEW: ensure reviews loaded before reviewer sort toggle
async function ensureAllReviews(eventId, subId) {
  if (!reviewsBySub.value[subId]) {
    await loadAllReviews(eventId, subId);
  }
}

// NEW: toggle buttons
function toggleEventSort(eventId) {
  subSortAscByEvent.value[eventId] = !subSortAscByEvent.value[eventId];
}
async function toggleReviewerSort(eventId, subId) {
  await ensureAllReviews(eventId, subId);
  revSortAscBySub.value[subId] = !revSortAscBySub.value[subId];
}

// NEW: submissions sorted by avg_score (and filtered by title)
function filteredSubmissions(eventId) {
  const all = submissionsByEvent.value[eventId] || [];
  const q = searchQGlobal.value.trim().toLowerCase();
  const arr = q ? all.filter(s => s.title.toLowerCase().includes(q)) : [...all];

  const asc = !!subSortAscByEvent.value[eventId];
  arr.sort((a, b) => {
    const av = Number(a.avg_score) || 0;
    const bv = Number(b.avg_score) || 0;
    return asc ? av - bv : bv - av;
  });
  return arr;
}

// Reviewer search (unchanged)
function filteredReviewerPool(eventId, subId) {
  const pool = reviewerPoolByEvent.value[eventId] || [];
  const q = (searchQBySub.value[subId] || "").trim().toLowerCase();
  const assigned = new Set((assignmentsBySub.value[subId] || []).map(a => a.reviewer_id));
  return pool
    .filter(u => !assigned.has(u.id))
    .filter(u => !q || u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q));
}

// NEW: sorted reviewer assignments by score_overall
function sortedAssignments(subId) {
  const asc = !!revSortAscBySub.value[subId];
  const list = (assignmentsBySub.value[subId] || []).slice();
  list.sort((ra, rb) => {
    const sa = Number(reviewsBySub.value[subId]?.[ra.reviewer_id]?.score_overall);
    const sb = Number(reviewsBySub.value[subId]?.[rb.reviewer_id]?.score_overall);
    const aVal = Number.isFinite(sa) ? sa : -Infinity; // missing scores go last
    const bVal = Number.isFinite(sb) ? sb : -Infinity;
    return asc ? aVal - bVal : bVal - aVal;
  });
  return list;
}

function toggleSelect(subId, uid) {
  const s = new Set(selectedToAddBySub.value[subId] || []);
  s.has(uid) ? s.delete(uid) : s.add(uid);
  selectedToAddBySub.value[subId] = s;
}
function toggleReviewDropdown(subId, reviewerId) {
  const set = expandedReviews.value[subId] || new Set();
  set.has(reviewerId) ? set.delete(reviewerId) : set.add(reviewerId);
  expandedReviews.value[subId] = set;
}

// --- CRUD actions ---
async function assignSelected(eventId, subId) {
  const sel = selectedToAddBySub.value[subId] || new Set();
  if (!sel.size) return;
  loading.value = true;
  try {
    const payload = { reviewers: [...sel] };
    const due = dueDateBySub.value[subId];
    if (due) payload.due_at = new Date(due).toISOString();
    await axios.post(`/chair/${eventId}/submissions/${subId}/assign`, payload);
    selectedToAddBySub.value[subId] = new Set();
    searchQBySub.value[subId] = "";
    dueDateBySub.value[subId] = "";
    await loadAssignments(eventId, subId);
    await loadSubmissions(eventId);
  } catch (e) {
    alert(e?.response?.data?.error || "Assign failed");
  } finally {
    loading.value = false;
  }
}
async function unassignOne(eventId, subId, reviewerId) {
  loading.value = true;
  try {
    await axios.post(`/chair/${eventId}/submissions/${subId}/unassign`, {
      reviewers: [reviewerId],
    });
    await loadAssignments(eventId, subId);
    await loadSubmissions(eventId);
  } catch (e) {
    alert(e?.response?.data?.error || "Unassign failed");
  } finally {
    loading.value = false;
  }
}
async function updateStatus(eventId, subId, status) {
  try {
    loading.value = true;
    await axios.put(`/chair/${eventId}/submissions/${subId}/status`, { status });
    const subs = submissionsByEvent.value[eventId] || [];
    const idx = subs.findIndex((s) => s.id === subId);
    if (idx !== -1) subs[idx].status = status;
  } catch (e) {
    alert(e?.response?.data?.error || "Update failed");
  } finally {
    loading.value = false;
  }
}

function eventAvgScore(eventId) {
  const subs = submissionsByEvent.value[eventId] || [];
  const valid = subs.map((s) => +s.avg_score).filter(Number.isFinite);
  if (!valid.length) return "—";
  return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2);
}

// --- External reviewer ---
async function submitExternalReviewer() {
  if (!extName.value) return alert("Please enter the reviewer's name.");
  extSubmitting.value = true;
  try {
    const { data } = await axios.post(
      `/external/chair/${openEventId.value}/external-reviewer`,
      { name: extName.value, email: extEmail.value, submissionId: targetSubmissionId.value }
    );
    generatedLink.value = data.link || data.reviewer?.link || "";
    extName.value = "";
    extEmail.value = "";
  } catch (err) {
    alert(err.response?.data?.error || "Failed to create external reviewer.");
  } finally {
    extSubmitting.value = false;
  }
}
async function logout() {
  try { await axios.post("/auth/logout"); } finally { router.push("/login"); }
}

// Track expanded external review sections
const expandedExternalReviews = ref({});
function toggleExternalReviews(subId) {
  expandedExternalReviews.value[subId] = !expandedExternalReviews.value[subId];
}
</script>

<style scoped>
/* Tailwind handles most styling */
</style>
