<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-10">
        <h1 class="text-3xl font-bold text-gray-900">Admin — Events</h1>
        <RouterLink
          to="/dashboard"
          class="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ← Back to Dashboard
        </RouterLink>
      </div>

      <!-- Error Message -->
      <div
        v-if="errorMsg"
        class="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
      >
        {{ errorMsg }}
      </div>

      <!-- Create Event Section -->
      <div
        class="bg-white shadow-lg border border-slate-200 rounded-xl p-6 mb-10 transition hover:shadow-xl"
      >
        <h2 class="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span class="text-indigo-600">＋</span> Create Event
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
            <input
              v-model="name"
              placeholder="e.g., IRCSET 2025"
              class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              v-model="description"
              placeholder="Optional short description"
              class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              v-model="start_date"
              type="date"
              class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              v-model="end_date"
              type="date"
              class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>
        </div>

        <div class="mt-6">
          <button
            :disabled="!name || loading"
            @click="createEvent"
            class="px-5 py-2.5 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {{ loading ? "Creating..." : "Create Event" }}
          </button>
        </div>
      </div>

      <!-- Events List Section -->
      <div class="bg-white shadow-lg border border-slate-200 rounded-xl p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span class="text-indigo-600">📅</span> All Events
        </h2>

        <div v-if="!events.length" class="text-gray-500 italic text-sm mt-2">
          No events have been created yet.
        </div>

        <div
          v-for="ev in events"
          :key="ev.id"
          class="border-t first:border-t-0 py-5 transition hover:bg-slate-50 rounded-lg px-2"
        >
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <!-- Event Info -->
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900">
                {{ ev.name }}
              </h3>
              <p class="text-sm text-gray-600 mt-1">
                {{ ev.description || "No description" }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                📆 {{ ev.start_date || "…" }} → {{ ev.end_date || "…" }}
              </p>

              <!-- Chairs -->
              <div class="mt-3">
                <p class="text-sm font-medium text-gray-800 mb-1">Chair(s):</p>
                <template v-if="chairsByEvent[ev.id]?.length">
                  <ul class="space-y-1">
                    <li
                      v-for="c in chairsByEvent[ev.id]"
                      :key="c.user_id"
                      class="flex items-center justify-between bg-slate-100 rounded-md px-3 py-1"
                    >
                      <span class="text-sm text-gray-700">{{ c.name || c.email }}</span>
                      <button
                        class="text-xs text-red-600 hover:text-red-800 font-medium"
                        @click="removeChair(ev.id, c.user_id)"
                      >
                        Remove
                      </button>
                    </li>
                  </ul>
                </template>
                <p v-else class="text-sm text-gray-500 italic">No chair assigned</p>
              </div>
            </div>

            <!-- Assign Chair -->
            <details
              :open="newEventId === ev.id"
              class="w-full md:w-[320px] border border-gray-200 bg-slate-50 rounded-lg p-3 shadow-sm"
            >
              <summary
                class="cursor-pointer font-medium text-gray-700 hover:text-indigo-600 flex items-center justify-between"
              >
                Assign Chair
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 transition-transform group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>

              <div class="mt-3 space-y-3">
                <!-- per-event search box -->
                <input
                  v-model="searchQByEvent[ev.id]"
                  @input="onSearchChange(ev.id)"
                  placeholder="Search users by name/email…"
                  class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                />

                <div
                  class="max-h-40 overflow-auto bg-white border border-gray-200 rounded-md divide-y divide-gray-100"
                >
                  <button
                    v-for="u in userResultsByEvent[ev.id] || []"
                    :key="u.id"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition"
                    :class="{ 'bg-indigo-50': selectedUserIdByEvent[ev.id] === u.id }"
                    @click="selectedUserIdByEvent[ev.id] = u.id"
                  >
                    <div class="font-medium text-gray-800">{{ u.name || u.email }}</div>
                    <div class="text-xs text-gray-500">{{ u.email }}</div>
                  </button>

                  <p
                    v-if="(searchQByEvent[ev.id] || '').length && (!userResultsByEvent[ev.id] || !userResultsByEvent[ev.id].length)"
                    class="p-2 text-xs text-gray-500 text-center"
                  >
                    No matching users
                  </p>
                </div>

                <button
                  class="w-full bg-indigo-600 text-white py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
                  :disabled="!selectedUserIdByEvent[ev.id]"
                  @click="assignChair(ev.id)"
                >
                  Assign as Chair
                </button>
              </div>
            </details>
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
const events = ref([])


const chairsByEvent = ref({})

const name = ref('')
const description = ref('')
const start_date = ref(null)
const end_date = ref(null)

const newEventId = ref(null)


const searchQByEvent = ref({})          // { [eventId]: string }
const userResultsByEvent = ref({})      // { [eventId]: array }
const selectedUserIdByEvent = ref({})   // { [eventId]: number | null }

onMounted(async () => {
  try {
    const { data } = await axios.get('/auth/me')
    const user = data?.user || null
    if (!user) return router.push('/login')
    if (!user.is_admin) return router.push('/dashboard')
  } catch {
    return router.push('/login')
  }

  await loadEvents()
})

async function loadEvents() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data } = await axios.get('/admin/events')
    events.value = data?.items || []
    await refreshChairs()
  } catch (e) {
    errorMsg.value = e?.response?.data?.error || 'Failed to load events'
  } finally {
    loading.value = false
  }
}

async function refreshChairs() {
  const map = {}
  await Promise.all(
    (events.value || []).map(async (ev) => {
      try {
        const { data } = await axios.get(`/admin/events/${ev.id}/users`)
        map[ev.id] = (data?.items || []).filter(x => x.role === 'chair')
      } catch {
        map[ev.id] = []
      }
    })
  )
  chairsByEvent.value = map
}

async function createEvent() {
  if (!name.value.trim()) return
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = {
      name: name.value.trim(),
      description: description.value.trim() || null,
      start_date: start_date.value || null,
      end_date: end_date.value || null,
    }
    const { data } = await axios.post('/admin/events', payload)

    name.value = ''
    description.value = ''
    start_date.value = null
    end_date.value = null

    newEventId.value = data?.event?.id ?? null
    await loadEvents()
  } catch (e) {
    errorMsg.value = e?.response?.data?.error || 'Create failed'
  } finally {
    loading.value = false
  }
}

// per-event user search
async function onSearchChange(eventId) {
  const q = (searchQByEvent.value[eventId] || '').trim()
  if (!q) {
    userResultsByEvent.value[eventId] = []
    return
  }
  try {
    const { data } = await axios.get('/admin/users', { params: { q, limit: 20 } })
    userResultsByEvent.value[eventId] = data?.items || []
  } catch {
    userResultsByEvent.value[eventId] = []
  }
}

async function assignChair(eventId) {
  const uid = selectedUserIdByEvent.value[eventId]
  if (!uid) return
  try {
    await axios.post(`/admin/events/${eventId}/assign`, {
      user_id: uid,
      role: 'chair',
    })
    selectedUserIdByEvent.value[eventId] = null
    await refreshChairs()
  } catch (e) {
    alert(e?.response?.data?.error || 'Assignment failed')
  }
}

async function removeChair(eventId, userId) {
  try {
    await axios.delete(`/admin/events/${eventId}/assign`, {
      data: { user_id: userId, role: 'chair' }
    })
    await refreshChairs()
  } catch (e) {
    alert(e?.response?.data?.error || 'Remove failed')
  }
}
</script>
