<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center py-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-10">Author — Submit Paper</h1>

    <div class="w-11/12 max-w-6xl bg-white rounded-2xl shadow-xl p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
      <!-- LEFT SIDE -->
      <div class="space-y-6">
        <!-- Event Selection -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">Event</label>
          <select
            v-model="eventId"
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
          >
            <option disabled value="">Select Event</option>
            <option
              v-for="ev in events"
              :key="ev.id"
              :value="ev.id"
            >
              {{ ev.name }}
              <span v-if="ev.start_date || ev.end_date">
                — {{ formatEventDate(ev.start_date, ev.end_date) }}
              </span>
            </option>
          </select>
        </div>

        <!-- Title -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">Paper Title</label>
          <input
            v-model="title"
            type="text"
            placeholder="Enter your paper title"
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
        </div>

        <!-- Abstract -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">Abstract</label>
          <textarea
            v-model="abstract"
            rows="4"
            placeholder="Summarize your paper..."
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 resize-none transition"
          ></textarea>
        </div>

        <!-- Keywords -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">Keywords</label>
          <input
            v-model="keywords"
            type="text"
            placeholder="e.g., cybersecurity, AI, IoT"
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
          />
          <p class="text-sm text-gray-500 mt-1">Separate multiple keywords with commas.</p>
        </div>

        <!-- IRC Member Email -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">IRC Member Email (optional)</label>
          <input
            v-model="ircEmail"
            type="email"
            placeholder="Enter IRC member email"
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>

        <!-- Authors -->
        <div>
          <label class="block text-gray-800 font-medium mb-3">Authors</label>

          <div
            v-for="(author, index) in authors"
            :key="index"
            class="flex flex-col space-y-2 mb-4 border p-4 rounded-lg bg-slate-50"
          >
            <div class="flex space-x-2">
              <input
                v-model="author.name"
                type="text"
                placeholder="Author name"
                class="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
              />
              <input
                v-model="author.email"
                type="email"
                placeholder="Email"
                class="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>
            <input
              v-model="author.organization"
              type="text"
              placeholder="Organization / Institution"
              class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
            />
            <button
              type="button"
              @click="removeAuthor(index)"
              class="self-end text-red-500 hover:text-red-700 text-sm font-semibold mt-1"
              title="Remove author"
            >
              ✕ Remove
            </button>
          </div>

          <button
            type="button"
            @click="addAuthor"
            class="px-4 py-2 text-sm font-medium bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition"
          >
            + Add Author
          </button>
        </div>
      </div>

      <!-- RIGHT SIDE (File Upload + Submit) -->
      <div class="flex flex-col items-center justify-start">
        <!-- Drop Zone -->
        <div
          class="w-full h-56 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center bg-slate-50 hover:bg-slate-100 transition-all duration-300 relative group"
          :class="{ 'bg-indigo-50 border-indigo-500': isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <div class="pointer-events-none">
            <svg
              class="mx-auto w-12 h-12 text-indigo-500 mb-3 group-hover:scale-110 transition-transform"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M7 16a4 4 0 01-4-4 4 4 0 014-4h1V6a2 2 0 012-2h4a2 2 0 012 2v2h1a4 4 0 014 4 4 4 0 01-4 4H7z"
              />
            </svg>
            <p class="text-gray-600">
              <span class="font-semibold text-indigo-600">Upload PDF</span> or drag & drop
            </p>
          </div>
          <input
            type="file"
            accept="application/pdf"
            class="absolute inset-0 opacity-0 cursor-pointer"
            @change="handleFileSelect"
          />
        </div>

        <!-- File Preview -->
        <div v-if="files.length" class="mt-6 w-full">
          <div class="p-4 rounded-lg bg-white shadow border border-gray-200">
            <div class="flex items-center space-x-3">
              <div class="text-3xl">📄</div>
              <div>
                <p class="text-gray-900 font-semibold truncate">{{ files[0].name }}</p>
                <p class="text-gray-500 text-sm">{{ formatSize(files[0].size) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Submit -->
        <button
          @click="submitPaper"
          class="mt-8 w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          :disabled="!eventId || !title || files.length === 0"
        >
          Submit Paper
        </button>

        <!-- Message -->
        <div
          v-if="message"
          class="mt-5 text-sm text-center font-medium px-4 py-2 rounded-md transition"
          :class="{
            'bg-green-50 text-green-700 border border-green-300': messageClass === 'success',
            'bg-red-50 text-red-700 border border-red-300': messageClass === 'error',
            'bg-blue-50 text-blue-700 border border-blue-300': messageClass === 'info'
          }"
        >
          {{ message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue"
import axios from "axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL

const eventId = ref("")
const title = ref("")
const ircEmail = ref("")
const abstract = ref("")
const keywords = ref("")
const authors = ref([{ name: "", email: "", organization: "" }])
const files = ref([])
const isDragging = ref(false)
const message = ref("")
const messageClass = ref("info")
const events = ref([])

function addAuthor() {
  authors.value.push({ name: "", email: "", organization: "" })
}

function removeAuthor(index) {
  authors.value.splice(index, 1)
}

function handleDrop(e) {
  isDragging.value = false
  if (e.dataTransfer.files.length) files.value = [e.dataTransfer.files[0]]
}

function handleFileSelect(e) {
  if (e.target.files.length) files.value = [e.target.files[0]]
}

function formatSize(size) {
  const kb = size / 1024
  const mb = kb / 1024
  return mb > 1 ? mb.toFixed(2) + " MB" : kb.toFixed(2) + " KB"
}

onMounted(async () => {
  try {
    const res = await axios.get("/events", { withCredentials: true })
    events.value = res.data.items || res.data || []
  } catch (err) {
    console.error("Failed to load events:", err)
  }
})

function formatEventDate(start, end) {
  if (!start && !end) return ""
  const opts = { year: "numeric", month: "short", day: "numeric" }
  const s = start ? new Date(start).toLocaleDateString("en-SG", opts) : "—"
  const e = end ? new Date(end).toLocaleDateString("en-SG", opts) : "—"
  return `${s} → ${e}`
}

async function submitPaper() {
  message.value = "Submitting..."
  messageClass.value = "info"

  try {
    const csrf = await axios.get(`/auth/csrf-token`, { withCredentials: true })
    const token = csrf.data.csrfToken || csrf.data.token

    const fd = new FormData()
    fd.append("pdf", files.value[0])
    fd.append("title", title.value)
    fd.append("abstract", abstract.value)
    fd.append("keywords", keywords.value)
    if (ircEmail.value) fd.append("irc_email", ircEmail.value)
    fd.append("authors", JSON.stringify(authors.value))

    const res = await fetch(`${API_BASE}/submissions/${eventId.value}`, {
      headers: { "X-CSRF-Token": token },
      method: "POST",
      body: fd,
      credentials: "include"
    })

    const data = await res.json().catch(() => null)

    if (res.ok) {
      message.value = "✅ Paper submitted successfully!"
      messageClass.value = "success"
    } else {
      message.value = `❌ Submission failed: ${data?.message || res.status}`
      messageClass.value = "error"
    }
  } catch (err) {
    message.value = "❌ Network error: " + err.message
    messageClass.value = "error"
  }
}
</script>
