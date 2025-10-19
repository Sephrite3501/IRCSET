<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12">
    <div class="max-w-5xl mx-auto px-6">
      <!-- Header -->
      <div class="flex justify-between items-center mb-10">
        <h1 class="text-3xl font-bold text-gray-900">Chair — Event Reviewers</h1>
        <button
          @click="logout"
          class="text-sm text-red-500 hover:underline font-medium"
        >
          Logout
        </button>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="p-4 mb-6 bg-red-50 text-red-700 border border-red-200 rounded-md"
      >
        {{ error }}
      </div>

      <!-- No Events -->
      <p v-if="!events.length" class="text-gray-500 italic">
        No events assigned to you.
      </p>

      <!-- Events List -->
      <div
        v-for="ev in events"
        :key="ev.id"
        class="card hover-lift mb-10 p-6"
      >
        <!-- Event Info -->
        <div class="flex justify-between items-start mb-5">
          <div>
            <h2 class="text-xl font-semibold text-gray-900">{{ ev.name }}</h2>
            <p class="text-sm text-gray-600 mt-1">{{ ev.description || "—" }}</p>
          </div>
          <span
            class="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-200"
          >
            {{ reviewersByEvent[ev.id]?.length || 0 }} reviewer(s)
          </span>
        </div>

        <!-- Current Reviewers -->
        <h3 class="text-sm font-semibold text-gray-700 mb-2">
          Current Reviewers
        </h3>
        <ul
          class="border border-gray-200 rounded-lg bg-gray-50 max-h-48 overflow-auto divide-y divide-gray-200 mb-5"
        >
          <li
            v-for="r in reviewersByEvent[ev.id] || []"
            :key="r.id"
            class="flex justify-between items-center px-4 py-2 bg-white hover:bg-slate-50 transition-colors"
          >
            <span class="text-sm text-gray-800">{{ r.name || r.email }}</span>
            <button
              class="text-xs text-red-500 hover:text-red-700 font-medium"
              @click="removeReviewer(ev.id, r.id)"
            >
              Remove
            </button>
          </li>
          <li
            v-if="!reviewersByEvent[ev.id]?.length"
            class="px-4 py-2 text-sm text-gray-500 italic"
          >
            None yet
          </li>
        </ul>

        <!-- Search Bar -->
        <div class="flex gap-2 items-center">
          <input
            v-model="searchQ"
            placeholder="Search users by email or name…"
            class="input"
          />
          <button class="btn btn-primary" @click="searchUsers(ev.id)">
            Search
          </button>
        </div>

        <!-- Search Results -->
        <div
          class="mt-3 max-h-48 overflow-auto border border-gray-200 rounded-lg bg-white shadow-sm divide-y divide-gray-100"
        >
          <button
            v-for="u in userResults"
            :key="u.id"
            class="w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors text-sm"
            @click="addReviewer(ev.id, u.id)"
          >
            <div class="font-medium text-gray-800">
              {{ u.name || u.email }}
            </div>
            <div class="text-xs text-gray-500">{{ u.email }}</div>
          </button>

          <div
            v-if="userResults.length === 0 && searchQ"
            class="p-3 text-sm text-gray-500 italic"
          >
            No matching users found.
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
