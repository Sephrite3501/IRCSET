<template>
  <div class="min-h-screen bg-gray-50 py-10">
    <div class="max-w-5xl mx-auto px-4">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-semibold text-gray-800">Chair — Event Reviewers</h1>
        <button @click="logout" class="text-sm text-red-600 hover:underline">Logout</button>
      </div>

      <div v-if="error" class="p-3 bg-red-100 text-red-800 rounded mb-4">{{ error }}</div>

      <div v-if="!events.length" class="text-gray-500">No events assigned to you.</div>

      <div v-for="ev in events" :key="ev.id" class="border rounded-lg bg-white shadow mb-6 p-4">
        <h2 class="text-lg font-semibold">{{ ev.name }}</h2>
        <p class="text-sm text-gray-500 mb-3">{{ ev.description }}</p>

        <h3 class="font-medium mb-2">Current Reviewers</h3>
        <ul class="border rounded mb-3 max-h-40 overflow-auto">
          <li
            v-for="r in reviewersByEvent[ev.id] || []"
            :key="r.id"
            class="flex justify-between items-center border-b px-3 py-2 last:border-0"
          >
            <span>{{ r.name || r.email }}</span>
            <button class="text-xs text-red-600 hover:underline" @click="removeReviewer(ev.id, r.id)">Remove</button>
          </li>
          <li v-if="!reviewersByEvent[ev.id]?.length" class="px-3 py-2 text-sm text-gray-500">None yet</li>
        </ul>

        <div class="flex gap-2 items-center">
          <input
            v-model="searchQ"
            placeholder="Search users by email/name…"
            class="border rounded px-3 py-2 w-full"
          />
          <button
            class="bg-indigo-600 text-white px-3 py-2 rounded"
            @click="searchUsers(ev.id)"
          >
            Search
          </button>
        </div>

        <div class="mt-2 max-h-40 overflow-auto border rounded bg-white">
          <button
            v-for="u in userResults"
            :key="u.id"
            class="block w-full text-left px-3 py-2 hover:bg-gray-100 border-b last:border-0"
            @click="addReviewer(ev.id, u.id)"
          >
            {{ u.name || u.email }} <span class="text-xs text-gray-500">{{ u.email }}</span>
          </button>
          <div v-if="userResults.length === 0 && searchQ" class="p-2 text-sm text-gray-500">No results</div>
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
const events = ref([])
const reviewersByEvent = ref({})
const searchQ = ref('')
const userResults = ref([])
const error = ref('')

onMounted(async () => {
  try {
    const me = await axios.get('/auth/me')
    if (!me.data?.user) return router.push('/login')
    const { data } = await axios.get('/chair/my-events')
    events.value = data.items || []
    for (const ev of events.value) await loadReviewers(ev.id)
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to load events'
  }
})

async function loadReviewers(eventId) {
  try {
    const { data } = await axios.get(`/chair/${eventId}/reviewers`)
    reviewersByEvent.value[eventId] = data.items || []
  } catch {
    reviewersByEvent.value[eventId] = []
  }
}

async function searchUsers(eventId) {
  if (!searchQ.value) return
  try {
    const { data } = await axios.get(`/chair/${eventId}/users`, { params: { q: searchQ.value, limit: 20 } })
    userResults.value = data.items || []
  } catch {
    userResults.value = []
  }
}

async function addReviewer(eventId, userId) {
  try {
    await axios.post(`/chair/${eventId}/reviewers`, { user_id: userId, role: 'reviewer' })
    await loadReviewers(eventId)
    userResults.value = []
    searchQ.value = ''
  } catch (e) {
    alert(e?.response?.data?.error || 'Failed to add')
  }
}

async function removeReviewer(eventId, userId) {
  try {
    await axios.delete(`/chair/${eventId}/reviewers`, { data: { user_id: userId, role: 'reviewer' } })
    await loadReviewers(eventId)
  } catch (e) {
    alert(e?.response?.data?.error || 'Failed to remove')
  }
}

async function logout() {
  await axios.post('/auth/logout')
  router.push('/login')
}
</script>
