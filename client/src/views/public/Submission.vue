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
            <option v-for="ev in events" :key="ev.id" :value="ev.id">
              {{ ev.name }}
              <span v-if="ev.start_date || ev.end_date">
                — {{ formatEventDate(ev.start_date, ev.end_date) }}
              </span>
            </option>
          </select>
          <p v-if="errors.eventId" class="text-sm text-red-600 mt-1">{{ errors.eventId }}</p>
        </div>

        <!-- Title -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">Paper Title</label>
          <input
            v-model="title"
            @input="onTitleInput"
            type="text"
            placeholder="Enter your paper title"
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
          <p v-if="errors.title" class="text-sm text-red-600 mt-1">{{ errors.title }}</p>
        </div>

        <!-- Abstract -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">Abstract</label>
          <textarea
            v-model="abstract"
            @input="onAbstractInput"
            rows="4"
            placeholder="Summarize your paper..."
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 resize-none transition"
          ></textarea>
          <p v-if="errors.abstract" class="text-sm text-red-600 mt-1">{{ errors.abstract }}</p>
        </div>

        <!-- Keywords -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">Keywords</label>
          <input
            v-model="keywords"
            @input="onKeywordsInput"
            type="text"
            placeholder="e.g., cybersecurity, AI, IoT"
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
          />
          <p class="text-sm text-gray-500 mt-1">Separate multiple keywords with commas.</p>
          <p v-if="errors.keywords" class="text-sm text-red-600 mt-1">{{ errors.keywords }}</p>
        </div>

        <!-- IRC Member Email -->
        <div>
          <label class="block text-gray-800 font-medium mb-2">IRC Member Email (optional)</label>
          <input
            v-model="ircEmail"
            @input="onIrcEmailInput"
            type="email"
            placeholder="Enter IRC member email"
            class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
          />
          <p v-if="errors.ircEmail" class="text-sm text-red-600 mt-1">{{ errors.ircEmail }}</p>
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
                @input="onAuthorInput(index, 'name')"
                type="text"
                placeholder="Author name"
                class="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
              />
              <input
                v-model="author.email"
                @input="onAuthorInput(index, 'email')"
                type="email"
                placeholder="Email"
                class="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>
            <input
              v-model="author.organization"
              @input="onAuthorInput(index, 'organization')"
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

            <div v-if="authorErrors[index]" class="text-sm text-red-600">
              <p v-if="authorErrors[index].name">{{ authorErrors[index].name }}</p>
              <p v-if="authorErrors[index].email">{{ authorErrors[index].email }}</p>
            </div>
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
          @dragover.prevent="onDragOver"
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
            <p class="text-xs text-gray-500 mt-1">Only one .pdf file (max {{ MAX_FILE_MB }} MB)</p>
          </div>
          <input
            type="file"
            accept="application/pdf,.pdf"
            class="absolute inset-0 opacity-0 cursor-pointer"
            @change="handleFileSelect"
          />
        </div>
        <p v-if="errors.file" class="text-sm text-red-600 mt-2">{{ errors.file }}</p>

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
          :disabled="!canSubmit || submitting"
        >
          {{ submitting ? 'Submitting…' : 'Submit Paper' }}
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
import { ref, onMounted, computed } from "vue"
import axios from "axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3005"

// -------- limits & helpers --------
const MAX_TITLE_LEN = 200
const MAX_ABSTRACT_LEN = 4000
const MAX_KEYWORDS_LEN = 500
const MAX_AUTH_NAME = 120
const MAX_AUTH_ORG = 200
const MAX_FILE_MB = 20

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Keep this for final submit only (aggressive: removes control chars + trims)
const textCleanHard = (s, max) =>
  String(s ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

// Use this during typing (gentle: removes control chars, preserves spaces)
const textCleanSoft = (s, max) =>
  String(s ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, max);

const keywordClean = (s) =>
  String(s ?? "")
    .split(",")
    .map((k) => k.replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .filter(Boolean)
    .slice(0, 50) // cap keyword count
    .join(", ")

const emailNorm = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._%+\-@]/g, "")
    .slice(0, 254)

// -------- state --------
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
const submitting = ref(false)

// validation error bags
const errors = ref({
  eventId: "",
  title: "",
  abstract: "",
  keywords: "",
  ircEmail: "",
  file: "",
})
const authorErrors = ref([])

// -------- lifecycle --------
onMounted(async () => {
  try {
    const res = await axios.get("/events", { withCredentials: true })
    events.value = res.data.items || res.data || []
  } catch (err) {
    console.error("Failed to load events:", err)
  }
})

// -------- input handlers (sanitize on type) --------
function onTitleInput() {
  title.value = textCleanSoft(title.value, MAX_TITLE_LEN);
}
function onAbstractInput() {
  abstract.value = textCleanSoft(abstract.value, MAX_ABSTRACT_LEN);
}
function onKeywordsInput() {
  // preserve spaces while typing; final shaping happens on submit
  keywords.value = textCleanSoft(keywords.value, MAX_KEYWORDS_LEN);
}
function onAuthorInput(idx, field) {
  const a = authors.value[idx];
  if (!a) return;
  if (field === "name") a.name = textCleanSoft(a.name, MAX_AUTH_NAME);
  if (field === "email") a.email = emailNorm(a.email); // email stays strict
  if (field === "organization") a.organization = textCleanSoft(a.organization, MAX_AUTH_ORG);
}

function addAuthor() {
  authors.value.push({ name: "", email: "", organization: "" })
  authorErrors.value.push({})
}
function removeAuthor(index) {
  authors.value.splice(index, 1)
  authorErrors.value.splice(index, 1)
}

// -------- file handling (single PDF only) --------
function isPdf(file) {
  const nameOk = /\.pdf$/i.test(file.name || "")
  const typeOk = (file.type || "").toLowerCase() === "application/pdf"
  // some browsers may not set type reliably; accept if name ends with .pdf
  return nameOk || typeOk
}
function withinSize(file) {
  return file.size <= MAX_FILE_MB * 1024 * 1024
}
function setSinglePdf(file) {
  if (!file) return
  if (!isPdf(file)) {
    errors.value.file = "Only PDF files are allowed."
    files.value = []
    return
  }
  if (!withinSize(file)) {
    errors.value.file = `File too large. Maximum ${MAX_FILE_MB} MB.`
    files.value = []
    return
  }
  errors.value.file = ""
  files.value = [file] // enforce single file
}

function onDragOver(e) {
  e.dataTransfer.dropEffect = "copy"
  isDragging.value = true
}
function handleDrop(e) {
  isDragging.value = false
  const f = e.dataTransfer?.files?.[0]
  setSinglePdf(f)
}
function handleFileSelect(e) {
  const f = e.target?.files?.[0]
  setSinglePdf(f)
}

function formatSize(size) {
  const kb = size / 1024
  const mb = kb / 1024
  return mb > 1 ? mb.toFixed(2) + " MB" : kb.toFixed(2) + " KB"
}

function formatEventDate(start, end) {
  if (!start && !end) return ""
  const opts = { year: "numeric", month: "short", day: "numeric" }
  const s = start ? new Date(start).toLocaleDateString("en-SG", opts) : "—"
  const e = end ? new Date(end).toLocaleDateString("en-SG", opts) : "—"
  return `${s} → ${e}`
}

title.value = textCleanHard(title.value, MAX_TITLE_LEN);
abstract.value = textCleanHard(abstract.value, MAX_ABSTRACT_LEN);
keywords.value = keywordClean(keywords.value); // already trims per keyword
ircEmail.value = emailNorm(ircEmail.value);
authors.value = authors.value.map(a => ({
  name: textCleanHard(a.name, MAX_AUTH_NAME),
  email: emailNorm(a.email),
  organization: textCleanHard(a.organization, MAX_AUTH_ORG),
}));

// -------- validation before submit --------
function validateAll() {
  // reset
  errors.value = { eventId: "", title: "", abstract: "", keywords: "", ircEmail: "", file: "" }
  authorErrors.value = authors.value.map(() => ({}))

  if (!eventId.value) errors.value.eventId = "Please select an event."
  if (!title.value) errors.value.title = "Title is required."
  if (!abstract.value) errors.value.abstract = "Abstract is required."
  if (ircEmail.value && !EMAIL_RE.test(ircEmail.value)) errors.value.ircEmail = "Invalid email format."

  if (!files.value.length) {
    errors.value.file = "Please attach a PDF file."
  } else if (!isPdf(files.value[0])) {
    errors.value.file = "Only PDF files are allowed."
  } else if (!withinSize(files.value[0])) {
    errors.value.file = `File too large. Maximum ${MAX_FILE_MB} MB.`
  }

  // authors validation (at least 1; each must have name + valid email)
  if (!authors.value.length) {
    authors.value.push({ name: "", email: "", organization: "" })
    authorErrors.value.push({ name: "Name is required.", email: "Valid email is required." })
  }

  authors.value.forEach((a, i) => {
    const errs = {}
    if (!textClean(a.name, MAX_AUTH_NAME)) errs.name = "Name is required."
    if (!EMAIL_RE.test(emailNorm(a.email))) errs.email = "Valid email is required."
    authorErrors.value[i] = errs
  })

  // return true if no errors
  const hasFormErrors =
    Object.values(errors.value).some(Boolean) ||
    authorErrors.value.some((bag) => Object.values(bag).some(Boolean))

  return !hasFormErrors
}

const canSubmit = computed(() => {
  // quick enable/disable; final gate is validateAll()
  return Boolean(eventId.value && title.value && files.value.length === 1 && !submitting.value)
})

// -------- submit --------
async function submitPaper() {
  message.value = ""
  messageClass.value = "info"

  // sanitize before final validation
  title.value = textClean(title.value, MAX_TITLE_LEN)
  abstract.value = textClean(abstract.value, MAX_ABSTRACT_LEN)
  keywords.value = keywordClean(keywords.value)
  ircEmail.value = emailNorm(ircEmail.value)
  authors.value = authors.value.map((a) => ({
    name: textClean(a.name, MAX_AUTH_NAME),
    email: emailNorm(a.email),
    organization: textClean(a.organization, MAX_AUTH_ORG),
  }))

  if (!validateAll()) {
    message.value = "Please fix the highlighted fields."
    messageClass.value = "error"
    return
  }

  submitting.value = true
  message.value = "Submitting..."
  messageClass.value = "info"

  try {
    // CSRF first
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
      credentials: "include",
    })

    const data = await res.json().catch(() => null)

    if (res.ok) {
      message.value = "✅ Paper submitted successfully!"
      messageClass.value = "success"
      // optional: reset the form
      // resetForm()
    } else {
      message.value = `❌ Submission failed: ${data?.message || res.status}`
      messageClass.value = "error"
    }
  } catch (err) {
    message.value = "❌ Network error: " + err.message
    messageClass.value = "error"
  } finally {
    submitting.value = false
  }
}

// optional reset helper
function resetForm() {
  eventId.value = ""
  title.value = ""
  ircEmail.value = ""
  abstract.value = ""
  keywords.value = ""
  authors.value = [{ name: "", email: "", organization: "" }]
  files.value = []
  errors.value = { eventId: "", title: "", abstract: "", keywords: "", ircEmail: "", file: "" }
  authorErrors.value = []
  message.value = ""
  messageClass.value = "info"
}
</script>
