<template>
  <div class="min-h-screen bg-gray-50 py-10 px-4 flex justify-center">
    <div class="w-full max-w-6xl bg-white shadow rounded-lg p-8">
      <h1 class="text-2xl font-bold text-gray-800 mb-6">My Submitted Papers</h1>

      <div v-if="events.length">
        <div v-for="event in events" :key="event.event_id" class="mb-10">
          <h2 class="text-xl font-semibold text-indigo-700 mb-4">
            {{ event.event_name }}
          </h2>

          <div
            v-for="paper in event.papers"
            :key="paper.submission_id"
            class="border rounded-lg mb-6 p-4 bg-gray-50"
          >
            <h3 class="text-lg font-semibold text-gray-900">{{ paper.title }}</h3>
            <p class="text-gray-600 text-sm mb-2">
              <strong>Status:</strong> {{ paper.status }}
            </p>
            <p class="text-gray-700 mb-3">
              <strong>Abstract:</strong> {{ paper.abstract || "—" }}
            </p>

            <div v-if="paper.reviews.length">
              <h4 class="font-semibold text-gray-800 mb-2">
                Reviews ({{ paper.reviews.length }})
              </h4>

              <div v-for="(review, i) in paper.reviews" :key="i" class="mb-3">
                <button
                  @click="toggleReview(paper.submission_id, i)"
                  class="flex justify-between items-center w-full bg-indigo-100 px-4 py-2 rounded-md text-left font-medium text-gray-800 hover:bg-indigo-200"
                >
                  <span>
                    Reviewer: {{ review.reviewer_name }}
                    <span v-if="!review.review_submitted" class="italic text-gray-500">(Pending)</span>
                  </span>
                  <svg
                    :class="{ 'rotate-180': isExpanded(paper.submission_id, i) }"
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 transition-transform duration-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div
                  v-if="isExpanded(paper.submission_id, i)"
                  class="border border-indigo-200 rounded-md mt-2 p-3 bg-white"
                >
                  <h5 class="text-sm font-semibold text-gray-800 mb-2">Score Breakdown</h5>
                  <table class="w-full text-sm border mb-3">
                    <thead class="bg-gray-100">
                      <tr>
                        <th class="py-1 px-2 border">Technical</th>
                        <th class="py-1 px-2 border">Relevance</th>
                        <th class="py-1 px-2 border">Innovation</th>
                        <th class="py-1 px-2 border">Writing</th>
                        <th class="py-1 px-2 border">Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td class="text-center border">{{ review.score_technical ?? "—" }}</td>
                        <td class="text-center border">{{ review.score_relevance ?? "—" }}</td>
                        <td class="text-center border">{{ review.score_innovation ?? "—" }}</td>
                        <td class="text-center border">{{ review.score_writing ?? "—" }}</td>
                        <td class="text-center border font-semibold text-indigo-600">
                          {{ review.score_overall ?? "—" }}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div class="bg-gray-50 border rounded-md p-3 mb-2">
                    <p class="text-sm text-gray-600 font-semibold mb-1">For Author:</p>
                    <p class="text-gray-800">{{ review.comments_for_author || "No comments yet." }}</p>
                  </div>

                  <div class="bg-gray-50 border rounded-md p-3">
                    <p class="text-sm text-gray-600 font-semibold mb-1">For Committee:</p>
                    <p class="text-gray-800 italic">{{ review.comments_committee || "N/A" }}</p>
                  </div>
                </div>
              </div>
            </div>

            <p v-else class="text-gray-500 italic mt-2">
              No reviews yet for this paper.
            </p>
          </div>
        </div>
      </div>

      <p v-else class="text-gray-500 text-center mt-10">
        You haven't submitted any papers yet.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import axios from "axios";

const events = ref([]);
const expanded = ref({}); // Track dropdown states

const toggleReview = (submissionId, idx) => {
  const key = `${submissionId}-${idx}`;
  expanded.value[key] = !expanded.value[key];
};

const isExpanded = (submissionId, idx) => expanded.value[`${submissionId}-${idx}`];

onMounted(async () => {
  try {
    const res = await axios.get("/users/mypapers", { withCredentials: true });
    events.value = res.data.events || [];
  } catch (e) {
    console.error("Failed to load papers:", e);
  }
});
</script>
