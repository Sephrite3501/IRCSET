<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-6">
    <div class="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden flex flex-col md:flex-row">
      <!-- LEFT: PDF Preview -->
      <div class="md:w-2/3 bg-slate-50 border-r border-slate-200 flex flex-col">
        <div class="p-5 border-b bg-white">
          <h2 class="text-lg font-semibold text-gray-800 flex items-center justify-between">
            Paper Preview
            <a
              v-if="paper?.id && eventId"
              :href="`${API_BASE}/events/${eventId}/submissions/${paper.id}/initial.pdf?dl=1`"
              class="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              ⬇ Download PDF
            </a>
          </h2>
        </div>

        <div class="flex-1 flex items-center justify-center p-4">
          <iframe
            v-if="paper?.id && eventId"
            :src="`${API_BASE}/events/${eventId}/submissions/${paper.id}/initial.pdf`"
            class="w-full h-[85vh] border rounded-lg"
          ></iframe>
          <p v-else class="text-gray-500 italic">No PDF uploaded.</p>
        </div>
      </div>

      <!-- RIGHT: Review Form -->
      <div class="md:w-1/3 p-8 overflow-y-auto">
        <div class="flex items-start justify-between mb-6">
          <h1 class="text-2xl font-bold text-gray-900 leading-snug">
            External Review — 
            <span class="text-indigo-600">{{ paper?.title || "Loading..." }}</span>
          </h1>
        </div>

        <!-- Metadata -->
        <div v-if="paper" class="space-y-4 mb-8">
          <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p class="text-sm text-gray-700">
              <strong>Event:</strong> {{ paper.event_name || `Event #${eventId}` }}
            </p>
            <p class="text-sm text-gray-700">
              <strong>Status:</strong>
              <span
                :class="[ 
                  'px-2 py-0.5 rounded text-xs font-semibold',
                  paper.status === 'submitted'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-yellow-100 text-yellow-700'
                ]"
              >
                {{ paper.status || '—' }}
              </span>
            </p>
          </div>

          <!-- Authors -->
          <div
            v-if="authorsList.length"
            class="bg-slate-50 border border-slate-200 rounded-lg p-3"
          >
            <h3 class="text-xs font-semibold text-gray-600 uppercase mb-1">Authors</h3>
            <ul class="text-sm text-gray-800 space-y-1">
              <li v-for="(a, i) in authorsList" :key="i">
                <span class="font-medium">{{ a.name }}</span>
                <template v-if="a.email">
                  — <span class="text-gray-500">{{ a.email }}</span>
                </template>
              </li>
            </ul>
          </div>

          <!-- Abstract -->
          <div
            v-if="paper.abstract"
            class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4"
          >
            <h3 class="text-xs font-semibold text-gray-600 uppercase mb-1">Abstract</h3>
            <p class="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
              {{ paper.abstract }}
            </p>
          </div>
        </div>

        <!-- Review Form -->
        <div class="border-t pt-6 mt-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">Submit Review</h2>
          <p class="text-xs text-gray-500 mb-5">
            <strong>Legend:</strong> 1 = Poor · 2 = Fair · 3 = Average · 4 = Good · 5 = Excellent
          </p>

          <form @submit.prevent="submitReview" class="space-y-5">
            <!-- Scores -->
            <div class="grid grid-cols-2 gap-3">
              <div v-for="item in scoreFields" :key="item.key" class="flex flex-col">
                <label class="text-sm font-medium text-gray-700 mb-1">{{ item.label }}</label>
                <input
                  v-model.number="item.ref.value"
                  type="number"
                  min="1"
                  max="5"
                  class="border border-gray-300 rounded-md w-20 text-center p-1 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 mx-auto"
                  required
                />
              </div>
            </div>

            <!-- Comments -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Comments for Author</label>
              <textarea
                v-model="commentsAuthor"
                rows="5"
                class="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-y"
                required
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Comments for Committee</label>
              <textarea
                v-model="commentsCommittee"
                rows="5"
                class="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-y"
              ></textarea>
            </div>

            <button
              type="submit"
              :disabled="submitting"
              class="w-full bg-indigo-600 text-white font-semibold py-2 rounded-md hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {{ submitting ? "Submitting..." : "Submit Review" }}
            </button>

            <p v-if="message" :class="messageClass" class="text-sm mt-2">
              {{ message }}
            </p>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const route = useRoute();
const token = route.params.token;

const paper = ref(null);
const eventId = ref(null);

const scoreTechnical = ref(1);
const scoreRelevance = ref(1);
const scoreInnovation = ref(1);
const scoreWriting = ref(1);
const commentsAuthor = ref("");
const commentsCommittee = ref("");
const submitting = ref(false);
const message = ref("");
const messageClass = ref("");

// Score field metadata
const scoreFields = [
  { key: "technical", label: "Technical (1–5)", ref: scoreTechnical },
  { key: "relevance", label: "Relevance (1–5)", ref: scoreRelevance },
  { key: "innovation", label: "Innovation (1–5)", ref: scoreInnovation },
  { key: "writing", label: "Writing (1–5)", ref: scoreWriting },
];

onMounted(async () => {
  try {
    const { data } = await axios.get(`/external/external-review/${token}`);
    if (!data?.submission) {
      message.value = "❌ Invalid or expired review link.";
      messageClass.value = "text-red-600";
      return;
    }
    paper.value = data.submission;
    eventId.value = paper.value.event_id;
  } catch (err) {
    console.error("Error loading external review:", err);
    message.value = "❌ Invalid or expired review link.";
    messageClass.value = "text-red-600";
  }
});

async function submitReview() {
  submitting.value = true;
  message.value = "";
  try {
    const res = await axios.post(`/external/external-review/${token}/submit`, {
      score_technical: scoreTechnical.value,
      score_relevance: scoreRelevance.value,
      score_innovation: scoreInnovation.value,
      score_writing: scoreWriting.value,
      comments_for_author: commentsAuthor.value,
      comments_committee: commentsCommittee.value,
    });
    if (res.data.ok) {
      message.value = "✅ Review submitted successfully!";
      messageClass.value = "text-green-600";
    } else {
      message.value = "❌ Failed to submit review.";
      messageClass.value = "text-red-600";
    }
  } catch (err) {
    console.error("Submit error:", err);
    message.value = `❌ ${err.response?.data?.error || "Network error"}`;
    messageClass.value = "text-red-600";
  } finally {
    submitting.value = false;
  }
}

const authorsList = computed(() => {
  if (!paper.value) return [];
  if (Array.isArray(paper.value.authors)) return paper.value.authors;
  if (typeof paper.value.authors === "string" && paper.value.authors.trim().startsWith("[")) {
    try {
      return JSON.parse(paper.value.authors);
    } catch {
      return [];
    }
  }
  if (typeof paper.value.authors === "string") {
    return paper.value.authors.split(",").map((s) => {
      const match = s.match(/(.*)<(.*)>/);
      if (match) return { name: match[1].trim(), email: match[2].trim() };
      return { name: s.trim(), email: "" };
    });
  }
  return [];
});
</script>
