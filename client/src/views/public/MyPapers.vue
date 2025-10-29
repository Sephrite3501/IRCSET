<template>
  <div
    class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4 flex justify-center"
  >
    <div class="w-full max-w-6xl bg-white shadow-xl rounded-2xl p-8">
      <h1 class="text-3xl font-bold text-gray-900 mb-8 border-b pb-4">
        My Submitted Papers
      </h1>

      <!-- 🔍 Search Bar -->
      <div class="flex items-center gap-3 mb-10">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by paper title or event name..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          ✕ Clear
        </button>
      </div>

      <!-- ✅ Filtered Events -->
      <div v-if="filteredEvents.length">
        <div
          v-for="event in filteredEvents"
          :key="event.event_id"
          class="mb-12 border-b border-gray-200 pb-8"
        >
          <h2 class="text-2xl font-semibold text-indigo-700 mb-6">
            {{ event.event_name }}
          </h2>

          <!-- Papers per Event -->
          <div
            v-for="paper in event.papers"
            :key="paper.submission_id"
            class="bg-white border border-gray-200 rounded-xl shadow-sm mb-8 hover:shadow-md transition-shadow duration-200"
          >
            <div class="p-6">
              <h3 class="text-xl font-semibold text-gray-900 mb-1">
                {{ paper.title }}
              </h3>

              <!-- Status Tag -->
              <div class="flex items-center mb-3">
                <span class="text-gray-700 text-sm font-medium mr-2"
                  >Status:</span
                >
                <span
                  :class="statusTagClass(paper.status)"
                  class="px-3 py-1 text-xs font-semibold rounded-full capitalize border transition-colors duration-200 ease-in-out"
                >
                  {{ paper.status || "—" }}
                </span>
              </div>

              <!-- Abstract -->
              <div
                v-if="paper.abstract"
                class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4"
              >
                <h3
                  class="text-xs font-semibold text-gray-600 uppercase mb-1"
                >
                  Abstract
                </h3>
                <p
                  class="text-sm text-gray-800 leading-relaxed whitespace-pre-line"
                >
                  {{ paper.abstract }}
                </p>
              </div>

              <!-- Keywords -->
              <div
                v-if="paper.keywords"
                class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4"
              >
                <h3
                  class="text-xs font-semibold text-gray-600 uppercase mb-1"
                >
                  Keywords
                </h3>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="(kw, i) in paper.keywords.split(',')"
                    :key="i"
                    class="bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full"
                  >
                    {{ kw.trim() }}
                  </span>
                </div>
              </div>

              <!-- Reviews hidden -->
              <div
                v-if="paper.status === 'under_review'"
                class="text-gray-500 italic mt-2"
              >
                Your paper is currently under review. Individual reviews are
                hidden.
              </div>

              <!-- Final upload -->
              <div
                v-if="paper.status === 'approved' || paper.status === 'final_required'"
                class="mt-5 border-t pt-4"
              >
                <h4 class="font-semibold text-gray-800 mb-2">
                  Upload Final Paper
                </h4>

                <form @submit.prevent="uploadFinalPaper(paper)">
                  <input
                    type="file"
                    accept="application/pdf"
                    @change="(e) => handleFileChange(e, paper.submission_id)"
                    class="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <button
                    type="submit"
                    class="mt-3 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition"
                    :disabled="uploading"
                  >
                    {{ uploading ? "Uploading..." : "Submit Final Copy" }}
                  </button>
                </form>
              </div>

              <!-- Final submitted -->
              <div
                v-else-if="paper.status === 'final_submitted'"
                class="mt-5 border-t pt-4"
              >
                <p class="text-green-700 text-sm font-semibold">
                  ✅ Final version submitted successfully.
                </p>
                <a
                  :href="`${API_BASE}/${paper.final_pdf_path}`"
                  target="_blank"
                  class="inline-flex items-center gap-2 bg-indigo-600 text-white px-3 py-1 rounded text-xs hover:bg-indigo-700 transition mt-2"
                >
                  View Submitted PDF
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p
        v-else
        class="text-gray-500 text-center mt-12 text-lg italic"
      >
        You haven't submitted any papers yet.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import axios from "axios";

const events = ref([]);
const searchQuery = ref("");
const selectedFiles = ref({});
const uploading = ref(false);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// Fetch papers
onMounted(async () => {
  try {
    const res = await axios.get("/users/mypapers", { withCredentials: true });
    events.value = res.data.events || [];
  } catch (e) {
    console.error("Failed to load papers:", e);
  }
});

// Handle file input
function handleFileChange(e, submissionId) {
  selectedFiles.value[submissionId] = e.target.files[0];
}

// Upload final paper
async function uploadFinalPaper(paper) {
  const file = selectedFiles.value[paper.submission_id];
  if (!file) return alert("Please select a PDF file first.");

  const formData = new FormData();
  formData.append("pdf", file);

  try {
    uploading.value = true;
    await axios.post(
      `/final/${paper.event_id}/${paper.submission_id}/final`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true,
      }
    );

    alert("Final paper uploaded successfully!");
    paper.status = "final_submitted";
  } catch (err) {
    console.error("Failed to upload final paper:", err);
    alert("Upload failed. Please try again.");
  } finally {
    uploading.value = false;
  }
}

// Filter papers by search
const filteredEvents = computed(() => {
  if (!searchQuery.value.trim()) return events.value;

  const q = searchQuery.value.toLowerCase();

  return events.value
    .map((event) => ({
      ...event,
      papers: event.papers.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          event.event_name.toLowerCase().includes(q)
      ),
    }))
    .filter((event) => event.papers.length > 0);
});

// Tag color by status
function statusTagClass(status) {
  const s = (status || "").toLowerCase().trim();
  if (s === "accepted" || s === "approved" || s === "final_required")
    return "bg-green-100 text-green-700 border-green-300";
  if (s === "final_submitted")
    return "bg-blue-100 text-blue-700 border-blue-300";
  if (s === "rejected")
    return "bg-red-100 text-red-700 border-red-300";
  if (s.includes("review"))
    return "bg-yellow-100 text-yellow-700 border-yellow-300";
  if (s === "submitted")
    return "bg-purple-100 text-purple-700 border-purple-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}
</script>
