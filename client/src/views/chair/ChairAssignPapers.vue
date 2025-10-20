<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10">
    <div class="max-w-7xl mx-auto px-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-10">
        <h1 class="text-3xl font-bold text-gray-900">
          Chair — Assign Reviewers
        </h1>
        <button
          class="text-sm text-red-500 font-medium hover:underline"
          @click="logout"
        >
          Logout
        </button>
      </div>

      <!-- Error Banner -->
      <div
        v-if="errorMsg"
        class="mb-6 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
      >
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
        <h2 class="text-xl font-semibold text-gray-800 mb-6 border-b pb-2">
          My Events
        </h2>

        <div v-if="!events.length" class="text-gray-500 italic">
          You are not assigned as chair in any event.
        </div>
        <RouterLink
            to="/chair/approved-papers"
            class="text-sm text-indigo-600 hover:text-indigo-800 mt-1"
          >
            View All Approved Papers
        </RouterLink>

        <!-- Events -->
        <div v-for="ev in events" :key="ev.id" class="mb-8">
          <div
            class="rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors duration-150 shadow-sm"
          >
            <button
              @click="toggleEvent(ev.id)"
              class="w-full flex justify-between items-center text-left p-5 focus:outline-none"
            >
              <div>
                <div class="font-semibold text-gray-900 text-lg">
                  {{ ev.name }}
                </div>
                <div class="text-sm text-gray-500">
                  {{ ev.description || "—" }}
                  <span v-if="ev.start_date || ev.end_date" class="ml-1">
                    ({{ ev.start_date || "…" }} → {{ ev.end_date || "…" }})
                  </span>
                </div>
              </div>
              <div
                class="text-xs text-gray-600 bg-white border rounded-md px-3 py-1 shadow-sm"
              >
                {{ (submissionsByEvent[ev.id]?.length || 0) }} submission(s)
              </div>
            </button>

            <!-- Expanded Panel -->
            <transition name="fade">
              <div
                v-if="openEventId === ev.id"
                class="px-6 pb-8 bg-white border-t border-gray-200 rounded-b-xl"
              >
                <div
                  v-if="filteredSubmissions(ev.id).length"
                  class="divide-y divide-gray-200"
                >
                  <!-- Submissions -->
                  <div
                    v-for="sub in filteredSubmissions(ev.id)"
                    :key="sub.id"
                    class="py-6"
                  >
                    <!-- Paper Header -->
                    <div
                      class="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    >
                      <div>
                        <h3 class="font-semibold text-gray-900 flex items-center gap-3">
                          {{ sub.title }}
                          <span
                            class="text-xs font-medium px-2 py-0.5 rounded"
                            :class="{
                              'bg-green-100 text-green-700': sub.status === 'approved',
                              'bg-red-100 text-red-700': sub.status === 'rejected',
                              'bg-gray-100 text-gray-700': !['approved','rejected'].includes(sub.status)
                            }"
                          >
                            {{ sub.status }}
                          </span>
                        </h3>
                        <p class="text-xs text-gray-500 mt-1">
                          <b>Assigned:</b> {{ sub.n_assigned }} •
                          <b>Reviews:</b> {{ sub.n_submitted }} •
                          <b>Avg Score:</b>
                          <span class="text-indigo-600">
                            {{ formatScore(sub.avg_score) }}
                          </span>
                        </p>
                      </div>
                      <!-- Approve / Reject Buttons -->
                      <div class="flex gap-2 mt-2 md:mt-0">
                        <!-- Approve -->
                        <button
                          @click="updateStatus(ev.id, sub.id, 'approved')"
                          class="px-3 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          :disabled="loading || sub.n_submitted < sub.n_assigned"
                        >
                          Approve
                        </button>

                        <!-- Reject -->
                        <button
                          @click="updateStatus(ev.id, sub.id, 'rejected')"
                          class="px-3 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          :disabled="loading || sub.n_submitted < sub.n_assigned"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    <!-- Current Reviewers -->
                    <div class="mt-4">
                      <h4
                        class="text-sm font-semibold text-gray-700 mb-1 border-b border-gray-200 pb-1"
                      >
                        Current Reviewers
                      </h4>
                      <div
                        class="bg-slate-50 border border-gray-200 rounded-lg overflow-hidden"
                      >
                        <div
                          v-if="!assignmentsBySub[sub.id]?.length"
                          class="p-4 text-gray-500 text-sm italic"
                        >
                          None assigned yet.
                        </div>

                        <div v-else class="divide-y">
                          <div
                            v-for="a in assignmentsBySub[sub.id]"
                            :key="a.reviewer_id"
                            class="px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                          >
                            <div
                              class="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                            >
                              <div>
                                <p class="text-sm font-medium text-gray-800">
                                  {{ a.name || a.email }}
                                </p>
                                <p class="text-xs text-gray-500">
                                  Review status: {{ a.review_status || "—" }}
                                  <span v-if="a.due_at">
                                    • due {{ fmt(a.due_at) }}
                                  </span>
                                </p>
                              </div>

                              <div class="flex gap-3 text-xs">
                                <button
                                  class="text-indigo-600 hover:underline"
                                  @click="
                                    toggleReviewDropdown(sub.id, a.reviewer_id)
                                  "
                                >
                                  {{
                                    expandedReviews[sub.id]?.has(a.reviewer_id)
                                      ? "Hide"
                                      : "Show"
                                  }}
                                  Review
                                </button>
                                <button
                                  class="text-red-500 hover:underline"
                                  :disabled="loading"
                                  @click="
                                    unassignOne(ev.id, sub.id, a.reviewer_id)
                                  "
                                >
                                  Remove
                                </button>
                              </div>
                            </div>

                            <!-- Review Dropdown -->
                            <transition name="fade">
                              <div
                                v-if="
                                  expandedReviews[sub.id]?.has(a.reviewer_id)
                                "
                                class="mt-4 p-4 bg-slate-50 border border-gray-200 rounded-lg"
                              >
                                <div
                                  v-if="
                                    !reviewsBySub[sub.id]?.[a.reviewer_id]
                                  "
                                >
                                  <button
                                    class="text-xs text-indigo-600 underline"
                                    @click="
                                      loadReview(ev.id, sub.id, a.reviewer_id)
                                    "
                                  >
                                    Load review
                                  </button>
                                </div>

                                <div
                                  v-else
                                  class="bg-white border rounded-lg p-5 mt-2 shadow-sm"
                                >
                                  <div
                                    class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5"
                                  >
                                    <div
                                      v-for="metric in [
                                        'Technical',
                                        'Relevance',
                                        'Innovation',
                                        'Writing',
                                      ]"
                                      :key="metric"
                                      class="text-center border rounded-lg p-3 bg-slate-50"
                                    >
                                      <p
                                        class="text-xs text-gray-500 uppercase tracking-wide"
                                      >
                                        {{ metric }}
                                      </p>
                                      <p
                                        class="text-lg font-semibold text-gray-800"
                                      >
                                        {{
                                          reviewsBySub[sub.id][a.reviewer_id][
                                            'score_' + metric.toLowerCase()
                                          ] ?? "—"
                                        }}
                                      </p>
                                    </div>
                                  </div>

                                  <div class="text-center mb-5">
                                    <p
                                      class="text-sm font-medium text-gray-600"
                                    >
                                      Overall Score
                                    </p>
                                    <p
                                      class="text-3xl font-bold text-indigo-700"
                                    >
                                      {{
                                        reviewsBySub[sub.id][a.reviewer_id]
                                          .score_overall ?? "—"
                                      }}
                                    </p>
                                  </div>

                                  <div
                                    class="grid grid-cols-1 md:grid-cols-2 gap-5"
                                  >
                                    <div>
                                      <label
                                        class="text-sm font-semibold text-gray-700 block mb-1"
                                      >
                                        Comments for Author
                                      </label>
                                      <div
                                        class="border border-gray-200 bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-line h-28 overflow-y-auto"
                                      >
                                        {{
                                          reviewsBySub[sub.id][a.reviewer_id]
                                            .comments_for_author || "—"
                                        }}
                                      </div>
                                    </div>

                                    <div>
                                      <label
                                        class="text-sm font-semibold text-gray-700 block mb-1"
                                      >
                                        Comments for Committee
                                      </label>
                                      <div
                                        class="border border-gray-200 bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-line h-28 overflow-y-auto"
                                      >
                                        {{
                                          reviewsBySub[sub.id][a.reviewer_id]
                                            .comments_committee || "—"
                                        }}
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

                    <!-- Assign Reviewers -->
                    <div class="mt-6">
                      <h4 class="text-sm font-semibold text-gray-700 mb-1">
                        Add Reviewers
                      </h4>

                      <div
                        class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2 items-start"
                      >
                        <!-- Search -->
                        <div class="md:col-span-2">
                          <input
                            v-model="searchQ"
                            placeholder="Search reviewers by name or email..."
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                          />
                          <div
                            class="mt-2 max-h-48 overflow-auto bg-white border border-gray-200 rounded-lg shadow-sm"
                          >
                            <button
                              v-for="u in filteredReviewerPool(ev.id, sub.id)"
                              :key="u.id"
                              class="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition border-b last:border-0"
                              :class="{
                                'bg-indigo-100': selectedToAdd.has(u.id),
                              }"
                              @click="toggleSelect(u.id)"
                            >
                              <div class="font-medium">
                                {{ u.name || u.email }}
                              </div>
                              <div class="text-xs text-gray-500">
                                {{ u.email }}
                              </div>
                            </button>

                            <div
                              v-if="
                                searchQ &&
                                filteredReviewerPool(ev.id, sub.id).length ===
                                  0
                              "
                              class="p-3 text-sm text-gray-500 italic"
                            >
                              No matching reviewers found.
                            </div>
                          </div>
                        </div>

                        <!-- Assign Button -->
                        <div>
                          <label
                            class="text-xs text-gray-600 block mb-1 font-medium"
                          >
                            Optional due date
                          </label>
                          <input
                            v-model="dueDate"
                            type="date"
                            class="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <button
                            class="mt-3 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm w-full font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
                            :disabled="!selectedToAdd.size || loading"
                            @click="assignSelected(ev.id, sub.id)"
                          >
                            {{ loading ? "Assigning…" : "Assign Selected" }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p
                  v-else
                  class="text-gray-500 italic mt-6 text-sm text-center border-t pt-4"
                >
                  No submissions in this event yet.
                </p>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script setup>
import axios from 'axios'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const errorMsg = ref('')

// events and per-event data
const events = ref([])
const openEventId = ref(null)

// reviewers pool per event (eligible reviewers already added to the event)
const reviewerPoolByEvent = ref({}) // eventId -> [{id,email,name}, ...]

// submissions per event
const submissionsByEvent = ref({}) // eventId -> [{ id,title,status,n_assigned,n_submitted,avg_score }, ...]

// per-submission current assignments
const assignmentsBySub = ref({}) // subId -> [{ reviewer_id, email, name, review_status, due_at }, ...]

// UI state for assigning
const searchQ = ref('')
const selectedToAdd = ref(new Set()) // reviewer ids to add to the currently open submission
const dueDate = ref('')

const expandedReviews = ref({}); // subId -> Set of reviewer_ids
const reviewsBySub = ref({}); // subId -> { reviewer_id: reviewData }

const searchQGlobal = ref('')

onMounted(async () => {
  // must be logged in
  try {
    const { data } = await axios.get('/auth/me')
    if (!data?.user) return router.push('/login')
  } catch { return router.push('/login') }

  await loadMyEvents()
})

// 1) Load chair's events
async function loadMyEvents() {
  errorMsg.value = ''
  try {
    const { data } = await axios.get('/chair/my-events')
    events.value = data?.items || []
    if (events.value.length) {
      openEventId.value = events.value[0].id
      await loadEventData(openEventId.value)
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.error || 'Failed to load events'
  }
}

// 2) When an event opens, load reviewers pool + submissions
async function onToggleEvent(eventId, e) {
  if (!e.target?.open) return
  openEventId.value = eventId
  searchQ.value = ''
  selectedToAdd.value = new Set()
  dueDate.value = ''
  await loadEventData(eventId)
}

async function loadEventData(eventId) {
  await Promise.all([
    loadReviewerPool(eventId),
    loadSubmissions(eventId),
  ])
  // also prefetch assignments for each submission
  const subs = submissionsByEvent.value[eventId] || []
  await Promise.all(subs.map(s => loadAssignments(eventId, s.id)))
}

// 2a) reviewers pool for this event
async function loadReviewerPool(eventId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/reviewers`)
    reviewerPoolByEvent.value = {
      ...reviewerPoolByEvent.value,
      [eventId]: (data?.items || []).map(r => ({
        id: r.user_id || r.id, // server may return user_id or id
        email: r.email,
        name: r.name
      }))
    }
  } catch {
    reviewerPoolByEvent.value = { ...reviewerPoolByEvent.value, [eventId]: [] }
  }
}

// 2b) submissions for this event
async function loadSubmissions(eventId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/submissions`, { params: { limit: 100 } })
    submissionsByEvent.value = {
      ...submissionsByEvent.value,
      [eventId]: data?.items || []
    }
  } catch {
    submissionsByEvent.value = { ...submissionsByEvent.value, [eventId]: [] }
  }
}

// 3) assignments for a submission
async function loadAssignments(eventId, subId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/submissions/${subId}/assignments`)
    assignmentsBySub.value = { ...assignmentsBySub.value, [subId]: data?.items || [] }
  } catch {
    assignmentsBySub.value = { ...assignmentsBySub.value, [subId]: [] }
  }
}

// UI helpers
function formatScore(n) {
  if (n == null) return '—'
  const x = Number(n)
  return Number.isFinite(x) ? x.toFixed(2) : '—'
}
function fmt(dt) {
  try { return new Date(dt).toLocaleDateString() } catch { return dt }
}
function filteredReviewerPool(eventId, subId) {
  const pool = reviewerPoolByEvent.value[eventId] || []
  const q = (searchQ.value || '').trim().toLowerCase()
  const assignedIds = new Set((assignmentsBySub.value[subId] || []).map(a => a.reviewer_id))
  return pool
    .filter(u => !assignedIds.has(u.id))
    .filter(u => !q || (u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q)))
}
function toggleSelect(uid) {
  const s = new Set(selectedToAdd.value)
  if (s.has(uid)) s.delete(uid); else s.add(uid)
  selectedToAdd.value = s
}

// Assign / Unassign
async function assignSelected(eventId, subId) {
  if (!selectedToAdd.value.size) return
  loading.value = true
  try {
    const reviewers = [...selectedToAdd.value]
    const payload = { reviewers }
    if (dueDate.value) payload.due_at = new Date(dueDate.value).toISOString()

    await axios.post(`/chair/${eventId}/submissions/${subId}/assign`, payload)

    // refresh
    selectedToAdd.value = new Set()
    searchQ.value = ''
    dueDate.value = ''
    await loadAssignments(eventId, subId)
    // also refresh the counts on the submission list
    await loadSubmissions(eventId)
  } catch (e) {
    alert(e?.response?.data?.error || 'Assign failed')
  } finally {
    loading.value = false
  }
}

async function unassignOne(eventId, subId, reviewerId) {
  loading.value = true
  try {
    await axios.post(`/chair/${eventId}/submissions/${subId}/unassign`, { reviewers: [reviewerId] })
    await loadAssignments(eventId, subId)
    await loadSubmissions(eventId)
  } catch (e) {
    alert(e?.response?.data?.error || 'Unassign failed')
  } finally {
    loading.value = false
  }
}

async function logout() {
  try { await axios.post('/auth/logout') } finally { router.push('/login') }
}


function toggleReviewDropdown(subId, reviewerId) {
  const set = expandedReviews.value[subId] || new Set();
  if (set.has(reviewerId)) set.delete(reviewerId);
  else set.add(reviewerId);
  expandedReviews.value = { ...expandedReviews.value, [subId]: set };
}

async function loadReview(eventId, subId, reviewerId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/submissions/${subId}/reviews`);
    const match = data.items.find(r => r.reviewer_user_id === reviewerId);
    if (!reviewsBySub.value[subId]) reviewsBySub.value[subId] = {};
    reviewsBySub.value[subId][reviewerId] = match || { error: 'No review found' };
  } catch (e) {
    console.error('Failed to load review:', e);
  }
}


// ✅ Search filtering
function filteredSubmissions(eventId) {
  const all = submissionsByEvent.value[eventId] || []
  const q = searchQGlobal.value.trim().toLowerCase()
  if (!q) return all
  return all.filter((s) => s.title.toLowerCase().includes(q))
}

// ✅ Approve / Reject
async function updateStatus(eventId, subId, newStatus) {
  try {
    loading.value = true
    await axios.put(`/chair/${eventId}/submissions/${subId}/status`, {
      status: newStatus
    })
    // Local update
    const subs = submissionsByEvent.value[eventId] || []
    const idx = subs.findIndex((s) => s.id === subId)
    if (idx !== -1) subs[idx].status = newStatus
  } catch (e) {
    alert(e?.response?.data?.error || 'Failed to update status')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* optional: you already use Tailwind, so no custom styles are required */
</style>
