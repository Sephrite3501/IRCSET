<template>
  <div class="min-h-screen bg-gray-50 py-10 px-4 flex justify-center">
    <div class="w-full max-w-5xl bg-white shadow rounded-lg p-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold text-gray-800">
          Review — {{ paper?.title || "Loading..." }}
        </h1>
        <RouterLink
          to="/tasks/assigned"
          class="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ← Back to Papers
        </RouterLink>
      </div>

      <!-- Paper Info -->
      <div v-if="paper" class="space-y-4 mb-8">
        <h2 class="text-xl font-semibold text-gray-900">{{ paper.title }}</h2>

        <div class="flex flex-wrap gap-4 text-sm text-gray-600">
          <p>
            <strong>Event:</strong> {{ paper.event_name || `Event #${eventId}` }}
          </p>
          <p>
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
        <div v-if="paper.authors?.length">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Authors:</h3>
          <ul class="list-disc list-inside text-gray-700 text-sm">
            <li v-for="(author, i) in paper.authors" :key="i">
              {{ author.name }} —
              <span class="text-gray-500">{{ author.email }}</span>
            </li>
          </ul>
        </div>

        <!-- Abstract -->
        <div v-if="paper.abstract">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Abstract:</h3>
          <p class="text-gray-800 leading-relaxed">{{ paper.abstract }}</p>
        </div>

        <!-- Keywords -->
        <div v-if="paper.keywords">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Keywords:</h3>
          <p class="text-gray-700 text-sm">{{ paper.keywords }}</p>
        </div>

        <!-- PDF Viewer -->
            <div class="mt-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Uploaded Paper (PDF):</h3>

            <div class="border rounded-lg bg-gray-100 p-4 text-center">
                <iframe
                v-if="paper.id && eventId"
                :src="`${API_BASE}/events/${eventId}/submissions/${paper.id}/initial.pdf`"
                class="w-full h-[80vh] rounded"
                ></iframe>

                <p v-else class="text-gray-500 italic">No PDF uploaded.</p>

                <a
                v-if="paper.id && eventId"
                :href="`${API_BASE}/events/${eventId}/submissions/${paper.id}/initial.pdf?dl=1`"
                class="inline-block mt-3 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                >
                ⬇ Download PDF
                </a>
            </div>
            </div>
      </div>

      <div v-else class="text-gray-500 italic text-center mt-10">
        Loading paper details...
      </div>

      <!-- Review Form -->
      <div class="border-t pt-6 mt-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4">
          Submit Your Review
        </h2>

            <form @submit.prevent="submitReview" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Technical Merit (1–5)</label>
                <input v-model.number="scoreTechnical" type="number" min="1" max="5" class="border border-gray-300 rounded-md w-24 p-1 text-center focus:ring-2 focus:ring-indigo-400" required />
                </div>
                <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Relevance (1–5)</label>
                <input v-model.number="scoreRelevance" type="number" min="1" max="5" class="border border-gray-300 rounded-md w-24 p-1 text-center focus:ring-2 focus:ring-indigo-400" required />
                </div>
                <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Innovation (1–5)</label>
                <input v-model.number="scoreInnovation" type="number" min="1" max="5" class="border border-gray-300 rounded-md w-24 p-1 text-center focus:ring-2 focus:ring-indigo-400" required />
                </div>
                <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Writing Quality (1–5)</label>
                <input v-model.number="scoreWriting" type="number" min="1" max="5" class="border border-gray-300 rounded-md w-24 p-1 text-center focus:ring-2 focus:ring-indigo-400" required />
                </div>
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Comments for Author</label>
                <textarea v-model="commentsAuthor" rows="3" placeholder="Feedback for the author..." class="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-400" required></textarea>
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Comments for Committee</label>
                <textarea v-model="commentsCommittee" rows="3" placeholder="Private notes for the committee..." class="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-400"></textarea>
            </div>

            <button
                type="submit"
                :disabled="submitting"
                class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition disabled:opacity-50"
            >
                {{ submitting ? "Submitting..." : "Submit Review" }}
            </button>

            <p v-if="message" :class="messageClass" class="text-sm mt-2">{{ message }}</p>
            </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, RouterLink } from "vue-router";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const scoreTechnical = ref(1);
const scoreRelevance = ref(1);
const scoreInnovation = ref(1);
const scoreWriting = ref(1);
const commentsAuthor = ref("");
const commentsCommittee = ref("");

// ----- Types -----
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
  authors?: Author[];
}

// ----- State -----
const route = useRoute();
const eventId = route.params.eventId as string;
const paperId = route.params.paperId as string;

const paper = ref<Paper | null>(null);
const reviewScore = ref<number | null>(null);
const reviewComments = ref("");
const submitting = ref(false);
const message = ref("");
const messageClass = ref("");

// Compute absolute /uploads path safely
const pdfUrl = computed(() => {
  if (!paper.value?.pdf_path) return "";
  // ensure no double "uploads/uploads"
  return `/uploads/${paper.value.pdf_path.replace(/^uploads[\\/]/, "").replace(/\\/g, "/")}`;
});

// ----- Lifecycle -----
onMounted(async () => {
  try {
    const res = await axios.get(`/reviewer/events/${eventId}/papers/${paperId}`, {
      withCredentials: true,
    });
    paper.value = res.data.submission || null;
  } catch (e) {
    console.error("Failed to fetch paper details", e);
  }
});

// ----- Methods -----
async function submitReview() {
  submitting.value = true;
  message.value = "";

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

        if (
        ![scoreTechnical.value, scoreRelevance.value, scoreInnovation.value, scoreWriting.value]
            .every((n) => Number.isInteger(n) && n >= 1 && n <= 5)
        ) {
            message.value = "⚠️ All scores must be integers between 1 and 5.";
            messageClass.value = "text-yellow-600";
            submitting.value = false;
            return;
        }

        console.log({
            score_technical: scoreTechnical.value,
            score_relevance: scoreRelevance.value,
            score_innovation: scoreInnovation.value,
            score_writing: scoreWriting.value,
        });

    if (res.data.ok) {
      message.value = "✅ Review submitted successfully!";
      messageClass.value = "text-green-600";
    } else {
      message.value = "❌ Submission failed.";
      messageClass.value = "text-red-600";
    }
  } catch (err) {
    console.error("Submit error:", err.response?.data || err.message);
    message.value = `❌ ${err.response?.data?.error || "Network or server error."}`;
    messageClass.value = "text-red-600";
  } finally {
    submitting.value = false;
  }
}
</script>
