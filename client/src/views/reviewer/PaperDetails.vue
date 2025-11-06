<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex justify-center items-center py-6 px-4">
    <div
      class="w-[95vw] h-[90vh] bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col md:flex-row"
    >
      <!-- LEFT: PDF Preview -->
      <div class="md:w-3/5 bg-slate-50 border-r border-slate-200 flex flex-col">
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
            class="w-full h-full border rounded-lg"
          ></iframe>
          <p v-else class="text-gray-500 italic">No PDF uploaded.</p>
        </div>
      </div>

      <!-- RIGHT: Review Information + Form -->
      <div class="md:w-2/5 p-10 overflow-y-auto">
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
                <span class="font-medium">{{ a.name }}</span>
                <template v-if="a.email">
                  — <span class="text-gray-500">{{ a.email }}</span>
                </template>
                <template v-if="a.organization">
                  <br /><span class="text-gray-600 text-sm italic">{{ a.organization }}</span>
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

          <!-- Keywords -->
          <div
            v-if="paper.keywords"
            class="bg-slate-50 border border-slate-200 rounded-lg p-3"
          >
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
                @input="autoResize($event)"
                placeholder="Provide constructive feedback for the author..."
                class="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none overflow-hidden min-h-[150px]"
                required
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Comments for Committee</label>
              <textarea
                v-model="commentsCommittee"
                @input="autoResize($event)"
                placeholder="Private notes for the committee..."
                class="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none overflow-hidden min-h-[150px]"
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
  organization?: string;
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

// Score field metadata
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

async function submitReview() {
  submitting.value = true;
  message.value = "";

  // Validate & sanitize client-side
  if (!validateReview()) {
    submitting.value = false;
    return;
  }

  try {
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
      message.value =
        paper.value?.review_status === "submitted"
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
    message.value = `❌ ${err.response?.data?.error || "Network error."}`;
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

function autoResize(e) {
  const el = e.target;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function sanitizeText(input: string, maxLen = 2000): string {
  return input
    ?.replace(/[<>]/g, "")         // strip HTML brackets
    .replace(/[\u0000-\u001F\u007F]/g, "") // remove control chars
    .trim()
    .slice(0, maxLen);
}

function validateReview() {
  const scoreFieldsValid = [scoreTechnical, scoreRelevance, scoreInnovation, scoreWriting].every(
    (ref) => Number.isInteger(ref.value) && ref.value >= 1 && ref.value <= 5
  );

  if (!scoreFieldsValid) {
    message.value = "⚠️ All scores must be between 1 and 5.";
    messageClass.value = "text-yellow-600";
    return false;
  }

  commentsAuthor.value = sanitizeText(commentsAuthor.value, 3000);
  commentsCommittee.value = sanitizeText(commentsCommittee.value, 3000);

  if (!commentsAuthor.value) {
    message.value = "⚠️ Please provide comments for the author.";
    messageClass.value = "text-yellow-600";
    return false;
  }

  if (commentsAuthor.value.length < 10) {
    message.value = "⚠️ Comments for author are too short.";
    messageClass.value = "text-yellow-600";
    return false;
  }

  return true;
}
</script>
