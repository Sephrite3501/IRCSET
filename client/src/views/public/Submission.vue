<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center py-12">
    <h1 class="text-2xl font-semibold text-gray-800 mb-8">Author — Submit Paper</h1>

    <!-- Two-column layout -->
    <div class="w-11/12 max-w-6xl bg-white rounded-xl shadow p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- LEFT SIDE: Form fields -->
      <div class="space-y-6">
        <div>
          <label class="block text-gray-700 font-medium mb-2">Event ID</label>
          <select
            v-model="eventId"
            class="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          >
            <option disabled value="">Select Event ID</option>
            <option v-for="id in [1, 2, 3, 4]" :key="id" :value="id">
              {{ id }}
            </option>
          </select>
        </div>

        <div>
          <label class="block text-gray-700 font-medium mb-2">Title</label>
          <input
            v-model="title"
            type="text"
            placeholder="Enter your paper title"
            class="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />
        </div>

        <div>
          <label class="block text-gray-700 font-medium mb-2">IRC Member Email (optional)</label>
          <input
            v-model="ircEmail"
            type="email"
            placeholder="Enter IRC member email"
            class="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />
        </div>
      </div>

      <!-- RIGHT SIDE: File upload + submit -->
      <div class="flex flex-col items-center">
        <!-- Drop Zone -->
        <div
          class="w-full h-48 border-2 border-dashed border-gray-400 rounded-xl flex items-center justify-center bg-gray-50 shadow-sm transition-all duration-300 hover:border-indigo-400 hover:shadow-md relative"
          :class="{ 'bg-indigo-50 border-indigo-500 shadow-lg': isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <div class="text-center space-y-2 pointer-events-none">
            <div class="text-4xl">☁️</div>
            <p class="text-gray-600">
              <span class="font-medium text-indigo-500">Choose files</span> or drag & drop here
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
          <div class="p-4 rounded-lg bg-white shadow border border-gray-200 transition-all">
            <div class="text-2xl mb-2">📄</div>
            <p class="text-gray-800 font-medium truncate">{{ files[0].name }}</p>
            <p class="text-gray-500 text-sm">{{ formatSize(files[0].size) }}</p>
          </div>
        </div>

        <!-- Submit button -->
        <button
          @click="submitPaper"
          class="mt-8 w-full bg-indigo-500 text-white font-semibold py-2 rounded-md hover:bg-indigo-600 transition disabled:opacity-50"
          :disabled="!eventId || !title || files.length === 0"
        >
          Submit
        </button>

        <div v-if="message" class="mt-4 text-sm text-center" :class="messageClass">
          {{ message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const eventId = ref("");
const title = ref("");
const ircEmail = ref("");
const files = ref([]);
const isDragging = ref(false);
const message = ref("");
const messageClass = ref("text-gray-600");

function handleDrop(e) {
  isDragging.value = false;
  if (e.dataTransfer.files.length) {
    files.value = [e.dataTransfer.files[0]];
  }
}

function handleFileSelect(e) {
  if (e.target.files.length) {
    files.value = [e.target.files[0]];
  }
}

function formatSize(size) {
  const kb = size / 1024;
  const mb = kb / 1024;
  return mb > 1 ? mb.toFixed(2) + " MB" : kb.toFixed(2) + " KB";
}

/**
 * Submits the paper to `/submissions/{eventId}`
 * mimicking the reference HTML's author submission logic.
 */
async function submitPaper() {
  message.value = "Submitting...";
  messageClass.value = "text-blue-500";

  try {

    const csrf = await axios.get(`/auth/csrf-token`, { withCredentials: true });
    const token = csrf.data.csrfToken || csrf.data.token;
    console.log("CSRF Token:", token);

    const fd = new FormData();
    fd.append("pdf", files.value[0]);
    fd.append("title", title.value);

    if (ircEmail.value) fd.append("irc_email", ircEmail.value);

    const res = await fetch(`${API_BASE}/submissions/${eventId.value}`, {
        headers: { "X-CSRF-Token": token },
        method: "POST",
        body: fd,
        credentials: "include",  
    });

    const data = await res.json().catch(() => null);

    if (res.ok) {
      message.value = "✅ Paper submitted successfully!";
      messageClass.value = "text-green-600";
      console.log("Submission result:", data);
    } else {
      message.value = `❌ Submission failed: ${data?.message || res.status}`;
      messageClass.value = "text-red-600";
      console.error("Submission failed:", data);
    }
  } catch (err) {
    message.value = "❌ Network error: " + err.message;
    messageClass.value = "text-red-600";
  }
}
</script>
