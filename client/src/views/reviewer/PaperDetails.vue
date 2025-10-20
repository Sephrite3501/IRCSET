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

      <!-- RIGHT: Review Information + Form -->
      <div class="md:w-1/3 p-8 overflow-y-auto">
        <!-- Header -->
        <div class="flex items-start justify-between mb-6">
          <h1 class="text-2xl font-bold text-gray-900 leading-snug">
            Review — <span class="text-indigo-600">{{ paper?.title || "Loading..." }}</span>
          </h1>
          <RouterLink
            to="/tasks/assigned"
            class="text-sm text-indigo-600 hover:text-indigo-800 mt-1"
          >
            ← Back
          </RouterLink>
        </div>

        <!-- Paper Meta Info -->
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
                    : paper.status === 'under_review'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700'
                ]"
              >
                {{ paper.status }}
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
                {{ a.name }}
                <template v-if="a.email"> — <span class="text-gray-500">{{ a.email }}</span></template>
                </li>
            </ul>
            </div>

            <!-- Abstract -->
          <div v-if="paper.abstract" class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
            <h3 class="text-xs font-semibold text-gray-600 uppercase mb-1">Abstract</h3>
            <p class="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
              {{ paper.abstract }}
            </p>
          </div>

          <div v-if="paper.keywords" class="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <h3 class="text-xs font-semibold text-gray-600 uppercase mb-1">Keywords</h3>
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
        </div>

        <!-- Review Form -->
        <div class="border-t pt-6 mt-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">Submit Review</h2>

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
                rows="3"
                placeholder="Provide constructive feedback..."
                class="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none"
                required
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Comments for Committee</label>
              <textarea
                v-model="commentsCommittee"
                rows="3"
                placeholder="Private notes for the committee..."
                class="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none"
              ></textarea>
            </div>

            <button
              type="submit"
              :disabled="submitting"
              class="w-full bg-indigo-600 text-white font-semibold py-2 rounded-md hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {{
                submitting
                  ? (paper?.review_status === "submitted" ? "Updating..." : "Submitting...")
                  : (paper?.review_status === "submitted" ? "Edit Review" : "Submit Review")
              }}
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

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, RouterLink } from "vue-router";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const route = useRoute();
const eventId = route.params.eventId as string;
const paperId = route.params.paperId as string;

interface Author {
  name: string;
  email: string;
}

interface Paper {
  id: number;
  title: string;
  abstract?: string;
  keywords?: string;
  pdf_path?: string;
  status: string;
  event_name: string;
  authors?: Author[] | string;
  review_status?: string;
  existing_review?: any;
}

const paper = ref<Paper | null>(null);

const scoreTechnical = ref<number>(1);
const scoreRelevance = ref<number>(1);
const scoreInnovation = ref<number>(1);
const scoreWriting = ref<number>(1);
const commentsAuthor = ref("");
const commentsCommittee = ref("");

const submitting = ref(false);
const message = ref("");
const messageClass = ref("");

// 🔧 Added: Score field metadata for rendering
const scoreFields = [
  { key: "technical", label: "Technical (1–5)", ref: scoreTechnical },
  { key: "relevance", label: "Relevance (1–5)", ref: scoreRelevance },
  { key: "innovation", label: "Innovation (1–5)", ref: scoreInnovation },
  { key: "writing", label: "Writing (1–5)", ref: scoreWriting },
];

onMounted(async () => {
  try {
    const res = await axios.get(`/reviewer/events/${eventId}/papers/${paperId}/review`, {
      withCredentials: true,
    });

    paper.value = res.data.submission || null;

    if (paper.value?.existing_review) {
      const r = paper.value.existing_review;
      scoreTechnical.value = r.score_technical ?? 1;
      scoreRelevance.value = r.score_relevance ?? 1;
      scoreInnovation.value = r.score_innovation ?? 1;
      scoreWriting.value = r.score_writing ?? 1;
      commentsAuthor.value = r.comments_for_author ?? "";
      commentsCommittee.value = r.comments_committee ?? "";
    }
  } catch (e) {
    console.error("Failed to fetch paper details", e);
  }
});

const pdfUrl = computed(() => {
  if (!paper.value?.pdf_path) return "";
  return `/uploads/${paper.value.pdf_path.replace(/^uploads[\\/]/, "").replace(/\\/g, "/")}`;
});

async function submitReview() {
  submitting.value = true;
  message.value = "";

  try {
    const scores = [scoreTechnical.value, scoreRelevance.value, scoreInnovation.value, scoreWriting.value];
    if (!scores.every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
      message.value = "⚠️ All scores must be integers between 1 and 5.";
      messageClass.value = "text-yellow-600";
      submitting.value = false;
      return;
    }

    const res = await axios.post(
      `/reviewer/events/${eventId}/papers/${paperId}/reviews`,
      {
        score_technical: scoreTechnical.value,
        score_relevance: scoreRelevance.value,
        score_innovation: scoreInnovation.value,
        score_writing: scoreWriting.value,
        comments_for_author: commentsAuthor.value,
        comments_committee: commentsCommittee.value,
      },
      { withCredentials: true }
    );

    if (res.data.ok) {
      message.value = paper.value?.review_status === "submitted"
        ? "✅ Review updated successfully!"
        : "✅ Review submitted successfully!";
      messageClass.value = "text-green-600";

      if (paper.value) paper.value.review_status = "submitted";
    } else {
      message.value = "❌ Submission failed.";
      messageClass.value = "text-red-600";
    }
  } catch (err: any) {
    console.error("Submit error:", err.response?.data || err.message);
    message.value = `❌ ${err.response?.data?.error || "Network or server error."}`;
    messageClass.value = "text-red-600";
  } finally {
    submitting.value = false;
  }
}

const authorsList = computed(() => {
  if (!paper.value) return [];

  // ✅ Case 1: Array of { name, email }
  if (Array.isArray(paper.value.authors)) return paper.value.authors;

  // ✅ Case 2: JSON string
  if (typeof paper.value.authors === "string" && paper.value.authors.trim().startsWith("[")) {
    try {
      return JSON.parse(paper.value.authors);
    } catch {
      return [];
    }
  }

  // ✅ Case 3: Plain string — "John Doe <john@example.com>, Jane Tan"
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
