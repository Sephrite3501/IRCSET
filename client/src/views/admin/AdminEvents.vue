<template>
  <div class="min-h-screen bg-gray-50 py-10">
    <div class="max-w-6xl mx-auto px-4">
      <h1 class="text-2xl font-semibold text-gray-800 mb-6">Admin — Events</h1>

      <div v-if="errorMsg" class="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700">
        {{ errorMsg }}
      </div>

      <!-- Create Event -->
      <div class="bg-white rounded-xl shadow border border-gray-200 p-6 mb-8">
        <h2 class="text-lg font-semibold mb-4">Create Event</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input v-model="name" placeholder="Event name" class="border rounded px-3 py-2" />
          <input v-model="description" placeholder="Description (optional)" class="border rounded px-3 py-2" />
          <label class="text-sm text-gray-600">Start date
            <input v-model="start_date" type="date" class="border rounded px-3 py-2 w-full" />
          </label>
          <label class="text-sm text-gray-600">End date
            <input v-model="end_date" type="date" class="border rounded px-3 py-2 w-full" />
          </label>
        </div>
        <button
          :disabled="!name || loading"
          @click="createEvent"
          class="mt-4 px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {{ loading ? 'Creating…' : 'Create Event' }}
        </button>
      </div>

      <!-- Events list -->
      <div class="bg-white rounded-xl shadow border border-gray-200 p-6">
        <h2 class="text-lg font-semibold mb-4">All Events</h2>
        <div v-if="!events.length" class="text-gray-500">No events yet.</div>

        <div v-for="ev in events" :key="ev.id" class="border-t first:border-t-0 py-4">
          <div class="flex items-start justify-between flex-wrap gap-2 w-full">
            <div class="flex-1">
              <div class="font-semibold text-gray-800">{{ ev.name }}</div>
              <div class="text-sm text-gray-500">
                {{ ev.description || '—' }}
                <span v-if="ev.start_date || ev.end_date" class="ml-2">
                  ({{ ev.start_date || '…' }} → {{ ev.end_date || '…' }})
                </span>
              </div>

              <!-- Current chair(s) -->
              <div class="mt-2 text-sm">
                <span class="font-medium">Chair:</span>
                <template v-if="chairsByEvent[ev.id]?.length">
                  <ul class="mt-1 space-y-1">
                    <li v-for="c in chairsByEvent[ev.id]" :key="c.user_id" class="flex items-center gap-2">
                      <span>{{ c.name || c.email }}</span>
                      <button
                        class="text-red-600 hover:underline"
                        @click="removeChair(ev.id, c.user_id)"
                      >
                        Remove
                      </button>
                    </li>
                  </ul>
                </template>
                <span v-else class="text-gray-500">None assigned</span>
              </div>
            </div>

            <!-- Assign chair panel -->
            <details :open="newEventId === ev.id" class="w-full md:w-auto">
              <summary class="cursor-pointer px-3 py-1.5 rounded border bg-gray-50 hover:bg-gray-100 inline-block">
                Assign Chair
              </summary>

              <div class="mt-3 p-3 bg-gray-50 rounded-lg border">
                <input
                  v-model="searchQ"
                  placeholder="Search users by name/email…"
                  class="w-full border rounded px-3 py-2"
                />
                <div class="mt-2 max-h-40 overflow-auto bg-white border rounded">
                  <button
                    v-for="u in userResults"
                    :key="u.id"
                    class="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0"
                    :class="{ 'bg-indigo-50': selectedUserId === u.id }"
                    @click="selectedUserId = u.id"
                  >
                    <div class="text-sm">{{ u.name || u.email }}</div>
                    <div class="text-xs text-gray-500">{{ u.email }}</div>
                  </button>
                  <div v-if="searchQ && userResults.length === 0" class="p-2 text-sm text-gray-500">No results</div>
                </div>

                <button
                  class="mt-3 px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-60"
                  :disabled="!selectedUserId"
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
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const errorMsg = ref('')
const events = ref([])

// map: eventId -> [{ user_id, email, name, role }]
const chairsByEvent = ref({})

const name = ref('')
const description = ref('')
const start_date = ref(null)
const end_date = ref(null)

const newEventId = ref(null)
const searchQ = ref('')
const userResults = ref([])
const selectedUserId = ref(null)

onMounted(async () => {
  // ensure only admins can access
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
    await refreshChairs()  // fetch chair mapping after events load
  } catch (e) {
    errorMsg.value = e?.response?.data?.error || 'Failed to load events'
  } finally {
    loading.value = false
  }
}

async function refreshChairs() {
  // fetch chairs per event
  const map = {}
  await Promise.all(
    (events.value || []).map(async (ev) => {
      try {
        const { data } = await axios.get(`/admin/events/${ev.id}/users`)
        // filter chairs
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

    // reset + open assign panel
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

// debounced user search
let timer
watch(searchQ, (q) => {
  clearTimeout(timer)
  if (!q) { userResults.value = []; return }
  timer = setTimeout(async () => {
    try {
      const { data } = await axios.get('/admin/users', { params: { q, limit: 20 } })
      userResults.value = data?.items || []
    } catch {
      userResults.value = []
    }
  }, 250)
})

async function assignChair(eventId) {
  if (!selectedUserId.value) return
  try {
    await axios.post(`/admin/events/${eventId}/assign`, {
      user_id: selectedUserId.value,
      role: 'chair',
    })
    selectedUserId.value = null
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

