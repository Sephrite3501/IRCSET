<template>
  <div class="min-h-screen bg-gray-50 py-10">
    <div class="max-w-7xl mx-auto px-4">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold text-gray-800">Chair — Assign Reviewers</h1>
        <button class="text-sm text-red-600 hover:underline" @click="logout">Logout</button>
      </div>

      <div v-if="errorMsg" class="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700">
        {{ errorMsg }}
      </div>

      <div class="bg-white rounded-xl shadow border border-gray-200 p-6">
        <h2 class="text-lg font-semibold mb-4">My Events</h2>
        <div v-if="!events.length" class="text-gray-500">You are not assigned as chair in any event.</div>

        <!-- One expandable panel per event -->
        <div v-for="ev in events" :key="ev.id" class="border-t first:border-t-0 py-6">
          <details :open="openEventId === ev.id" @toggle="onToggleEvent(ev.id, $event)" class="w-full">
            <summary class="cursor-pointer flex items-center justify-between gap-2">
              <div>
                <div class="font-semibold text-gray-800">{{ ev.name }}</div>
                <div class="text-sm text-gray-500">
                  {{ ev.description || '—' }}
                  <span v-if="ev.start_date || ev.end_date" class="ml-2">
                    ({{ ev.start_date || '…' }} → {{ ev.end_date || '…' }})
                  </span>
                </div>
              </div>
              <span class="text-xs text-gray-500 px-2 py-1 rounded bg-gray-100 border">
                {{ (submissionsByEvent[ev.id]?.length || 0) }} submission(s)
              </span>
            </summary>

            <div class="mt-4 space-y-6">
              <!-- Per submission row -->
              <div
                v-for="sub in (submissionsByEvent[ev.id] || [])"
                :key="sub.id"
                class="rounded-lg border bg-gray-50 p-4"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="font-medium text-gray-900">
                      {{ sub.title }}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                      Status: <b class="mr-3">{{ sub.status }}</b>
                      Assigned: <b class="mr-3">{{ sub.n_assigned }}</b>
                      Reviews submitted: <b class="mr-3">{{ sub.n_submitted }}</b>
                      Avg score: <b>{{ formatScore(sub.avg_score) }}</b>
                    </div>
                  </div>
                </div>

                <!-- Current assignments list -->
                <div class="mt-3">
                  <h4 class="text-sm font-semibold text-gray-700">Current Reviewers</h4>
                  <div class="border rounded bg-white mt-2">
                    <div v-if="!assignmentsBySub[sub.id]?.length" class="p-3 text-sm text-gray-500">
                      None assigned
                    </div>
                    <div v-else class="divide-y">
                      <div
                        v-for="a in assignmentsBySub[sub.id]"
                        :key="a.reviewer_id"
                        class="flex items-center justify-between px-3 py-2"
                      >
                        <div class="text-sm">
                          <div>{{ a.name || a.email }}</div>
                          <div class="text-xs text-gray-500">
                            Review status: {{ a.review_status || '—' }}
                            <span v-if="a.due_at"> • due {{ fmt(a.due_at) }}</span>
                          </div>
                        </div>
                        <button
                          class="text-xs text-red-600 hover:underline"
                          :disabled="loading"
                          @click="unassignOne(ev.id, sub.id, a.reviewer_id)"
                          title="Unassign reviewer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Assign reviewers -->
                <div class="mt-4">
                  <h4 class="text-sm font-semibold text-gray-700">Add Reviewers</h4>

                  <!-- Search over the event's reviewer pool (client-side filter) -->
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                    <div class="md:col-span-2">
                      <input
                        v-model="searchQ"
                        placeholder="Type to filter reviewers by name/email…"
                        class="w-full border rounded px-3 py-2"
                      />
                      <div class="mt-2 max-h-40 overflow-auto bg-white border rounded">
                        <button
                          v-for="u in filteredReviewerPool(ev.id, sub.id)"
                          :key="u.id"
                          class="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0"
                          :class="{ 'bg-indigo-50': selectedToAdd.has(u.id) }"
                          @click="toggleSelect(u.id)"
                        >
                          <div class="text-sm">{{ u.name || u.email }}</div>
                          <div class="text-xs text-gray-500">{{ u.email }}</div>
                        </button>
                        <div
                          v-if="searchQ && filteredReviewerPool(ev.id, sub.id).length === 0"
                          class="p-2 text-sm text-gray-500"
                        >
                          No matches in this event's reviewer pool
                        </div>
                      </div>
                    </div>

                    <div>
                      <label class="text-xs text-gray-600 block mb-1">Optional due date</label>
                      <input
                        v-model="dueDate"
                        type="date"
                        class="border rounded px-3 py-2 w-full"
                      />
                      <button
                        class="mt-3 px-3 py-2 rounded bg-indigo-600 text-white w-full disabled:opacity-60"
                        :disabled="!selectedToAdd.size || loading"
                        @click="assignSelected(ev.id, sub.id)"
                      >
                        {{ loading ? 'Assigning…' : 'Assign selected' }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="(submissionsByEvent[ev.id] || []).length === 0" class="text-gray-500">
                No submissions in this event yet.
              </div>
            </div>
          </details>
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
</script>

<style scoped>
/* optional: you already use Tailwind, so no custom styles are required */
</style>
