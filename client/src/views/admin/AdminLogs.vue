<template>
  <div class="min-h-screen bg-slate-50 py-10 px-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Admin — Audit Logs</h1>
          <p class="text-sm text-gray-500 mt-1">View all system audit logs and security events</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow-lg border border-slate-200 rounded-xl p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4">Filters</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Severity</label>
            <select
              v-model="filters.severity"
              class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <input
              v-model="filters.action"
              type="text"
              placeholder="Filter by action..."
              class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Actor User ID</label>
            <input
              v-model.number="filters.actor_user_id"
              type="number"
              placeholder="User ID..."
              class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
            <input
              v-model="filters.entity_type"
              type="text"
              placeholder="e.g., submission, user..."
              class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Entity ID</label>
            <input
              v-model="filters.entity_id"
              type="text"
              placeholder="Entity ID..."
              class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>
        </div>

        <div class="flex items-center gap-3 mt-4">
          <button
            @click="applyFilters"
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition text-sm font-medium"
          >
            Apply Filters
          </button>
          <button
            @click="clearFilters"
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition text-sm font-medium"
          >
            Clear
          </button>
          <button
            @click="fetchLogs"
            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      <!-- Error Message -->
      <div
        v-if="errorMsg"
        class="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
      >
        {{ errorMsg }}
      </div>

      <!-- Logs Table -->
      <div class="bg-white shadow-lg border border-slate-200 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm text-gray-700">
            <thead class="bg-slate-100 text-gray-800 border-b">
              <tr>
                <th class="p-3 text-left font-semibold">Timestamp</th>
                <th class="p-3 text-left font-semibold">Severity</th>
                <th class="p-3 text-left font-semibold">Action</th>
                <th class="p-3 text-left font-semibold">Actor</th>
                <th class="p-3 text-left font-semibold">Entity</th>
                <th class="p-3 text-left font-semibold">IP Address</th>
                <th class="p-3 text-left font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="log in logs"
                :key="log.id"
                class="border-b hover:bg-slate-50 transition"
              >
                <td class="p-3 text-gray-600">
                  {{ formatDate(log.created_at) }}
                </td>
                <td class="p-3">
                  <span
                    :class="[
                      'px-2 py-1 rounded text-xs font-semibold',
                      log.severity === 'error' ? 'bg-red-100 text-red-700' :
                      log.severity === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    ]"
                  >
                    {{ log.severity?.toUpperCase() || 'INFO' }}
                  </span>
                </td>
                <td class="p-3 font-medium text-gray-900">
                  {{ log.action }}
                </td>
                <td class="p-3 text-gray-700">
                  <div v-if="log.actor_email">
                    <div class="font-medium">{{ log.actor_name || log.actor_email }}</div>
                    <div class="text-xs text-gray-500">ID: {{ log.actor_user_id }}</div>
                  </div>
                  <span v-else class="text-gray-400 italic">System</span>
                </td>
                <td class="p-3 text-gray-700">
                  <div v-if="log.entity_type">
                    <div class="font-medium">{{ log.entity_type }}</div>
                    <div class="text-xs text-gray-500" v-if="log.entity_id">ID: {{ log.entity_id }}</div>
                  </div>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td class="p-3 text-gray-600 text-xs font-mono">
                  {{ log.ip || '—' }}
                </td>
                <td class="p-3">
                  <button
                    @click="toggleDetails(log.id)"
                    class="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                  >
                    {{ expandedLogs.has(log.id) ? 'Hide' : 'Show' }} Details
                  </button>
                  <div
                    v-if="expandedLogs.has(log.id)"
                    class="mt-2 p-2 bg-gray-50 rounded border text-xs font-mono max-w-md overflow-auto"
                  >
                    <pre class="whitespace-pre-wrap">{{ formatDetails(log.details) }}</pre>
                    <div v-if="log.trace_id" class="mt-1 text-gray-500">
                      Trace ID: {{ log.trace_id }}
                    </div>
                    <div v-if="log.user_agent" class="mt-1 text-gray-500 text-xs">
                      UA: {{ log.user_agent }}
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="!logs.length && !loading"
          class="text-center py-8 text-gray-500"
        >
          No logs found.
        </div>

        <div v-if="loading" class="text-center py-8 text-gray-400 italic">
          Loading logs...
        </div>

        <!-- Pagination -->
        <div
          v-if="total > 0"
          class="border-t bg-slate-50 px-6 py-4 flex items-center justify-between"
        >
          <div class="text-sm text-gray-600">
            Showing {{ (page - 1) * limit + 1 }} to {{ Math.min(page * limit, total) }} of {{ total }} logs
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="changePage(page - 1)"
              :disabled="page <= 1"
              class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span class="text-sm text-gray-600">
              Page {{ page }} of {{ Math.ceil(total / limit) }}
            </span>
            <button
              @click="changePage(page + 1)"
              :disabled="page >= Math.ceil(total / limit)"
              class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const logs = ref([])
const loading = ref(false)
const errorMsg = ref('')
const page = ref(1)
const limit = ref(100)
const total = ref(0)
const expandedLogs = ref(new Set())

const filters = ref({
  severity: '',
  action: '',
  actor_user_id: null,
  entity_type: '',
  entity_id: ''
})

onMounted(async () => {
  try {
    const { data } = await axios.get('/auth/me')
    const user = data?.user || null
    if (!user) return router.push('/login')
    if (!user.is_admin) return router.push('/mypapers')
  } catch {
    return router.push('/login')
  }

  await fetchLogs()
})

async function fetchLogs() {
  loading.value = true
  errorMsg.value = ''
  try {
    const params = {
      page: page.value,
      limit: limit.value
    }

    if (filters.value.severity) params.severity = filters.value.severity
    if (filters.value.action) params.action = filters.value.action
    if (filters.value.actor_user_id) params.actor_user_id = filters.value.actor_user_id
    if (filters.value.entity_type) params.entity_type = filters.value.entity_type
    if (filters.value.entity_id) params.entity_id = filters.value.entity_id

    const { data } = await axios.get('/admin/logs', { params, withCredentials: true })
    logs.value = data?.items || []
    total.value = data?.total || 0
  } catch (e) {
    errorMsg.value = e?.response?.data?.error || 'Failed to load logs'
    console.error('Failed to fetch logs:', e)
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  fetchLogs()
}

function clearFilters() {
  filters.value = {
    severity: '',
    action: '',
    actor_user_id: null,
    entity_type: '',
    entity_id: ''
  }
  page.value = 1
  fetchLogs()
}

function changePage(newPage) {
  page.value = newPage
  fetchLogs()
}

function toggleDetails(logId) {
  if (expandedLogs.value.has(logId)) {
    expandedLogs.value.delete(logId)
  } else {
    expandedLogs.value.add(logId)
  }
}

function formatDate(dateString) {
  if (!dateString) return '—'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatDetails(details) {
  if (!details) return 'No details'
  if (typeof details === 'string') {
    try {
      return JSON.stringify(JSON.parse(details), null, 2)
    } catch {
      return details
    }
  }
  return JSON.stringify(details, null, 2)
}
</script>

