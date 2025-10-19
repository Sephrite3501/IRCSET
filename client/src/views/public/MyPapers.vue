<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4 flex justify-center">
    <div class="w-full max-w-6xl bg-white shadow-xl rounded-2xl p-8">
      <h1 class="text-3xl font-bold text-gray-900 mb-8 border-b pb-4">
        My Submitted Papers
      </h1>

      <div v-if="events.length">
        <div
          v-for="event in events"
          :key="event.event_id"
          class="mb-12 border-b border-gray-200 pb-8"
        >
          <h2 class="text-2xl font-semibold text-indigo-700 mb-6">
            {{ event.event_name }}
          </h2>

          <div
            v-for="paper in event.papers"
            :key="paper.submission_id"
            class="bg-white border border-gray-200 rounded-xl shadow-sm mb-8 hover:shadow-md transition-shadow duration-200"
          >
            <div class="p-6">
              <h3 class="text-xl font-semibold text-gray-900 mb-1">
                {{ paper.title }}
              </h3>
              <p class="text-gray-600 text-sm mb-3">
                <strong>Status:</strong>
                <span
                  :class="{
                    'text-green-600 font-medium': paper.status === 'Accepted',
                    'text-red-600 font-medium': paper.status === 'Rejected',
                    'text-yellow-600 font-medium': paper.status === 'Under Review'
                  }"
                >
                  {{ paper.status }}
                </span>
              </p>
              <p class="text-gray-700 leading-relaxed mb-4">
                <strong class="text-gray-800">Abstract:</strong>
                {{ paper.abstract || "—" }}
              </p>

              <!-- Reviews -->
              <div v-if="paper.reviews.length">
                <h4 class="font-semibold text-gray-800 mb-3">
                  Reviews ({{ paper.reviews.length }})
                </h4>

                <div
                  v-for="(review, i) in paper.reviews"
                  :key="i"
                  class="mb-4 border border-indigo-100 rounded-lg overflow-hidden"
                >
                  <button
                    @click="toggleReview(paper.submission_id, i)"
                    class="flex justify-between items-center w-full bg-indigo-50 hover:bg-indigo-100 px-5 py-3 text-left font-medium text-gray-800 transition"
                  >
                    <span>
                      Reviewer: {{ review.reviewer_name }}
                      <span
                        v-if="!review.review_submitted"
                        class="italic text-gray-500"
                        >(Pending)</span
                      >
                    </span>
                    <svg
                      :class="{ 'rotate-180': isExpanded(paper.submission_id, i) }"
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 transition-transform duration-200"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  <!-- Expanded Review -->
                  <div
                    v-if="isExpanded(paper.submission_id, i)"
                    class="p-6 bg-white border-t border-indigo-100"
                  >
                    <h5 class="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                      <svg
                        class="w-4 h-4 mr-1 text-indigo-600"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Score Breakdown
                    </h5>

                    <div class="overflow-x-auto mb-5">
                      <table
                        class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden"
                      >
                        <thead class="bg-gray-100 text-gray-700">
                          <tr>
                            <th class="py-2 px-3 border">Technical</th>
                            <th class="py-2 px-3 border">Relevance</th>
                            <th class="py-2 px-3 border">Innovation</th>
                            <th class="py-2 px-3 border">Writing</th>
                            <th class="py-2 px-3 border">Overall</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr class="text-center text-gray-800">
                            <td class="border py-2">
                              {{ review.score_technical ?? "—" }}
                            </td>
                            <td class="border py-2">
                              {{ review.score_relevance ?? "—" }}
                            </td>
                            <td class="border py-2">
                              {{ review.score_innovation ?? "—" }}
                            </td>
                            <td class="border py-2">
                              {{ review.score_writing ?? "—" }}
                            </td>
                            <td
                              class="border py-2 font-semibold text-indigo-600"
                            >
                              {{ review.score_overall ?? "—" }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <!-- Comments -->
                    <div class="space-y-4">
                      <div
                        class="border border-gray-200 bg-gray-50 rounded-lg p-4"
                      >
                        <p
                          class="text-sm font-semibold text-gray-700 mb-1 flex items-center"
                        >
                          <svg
                            class="w-4 h-4 mr-1 text-indigo-500"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M7 8h10M7 12h4m1 8a9 9 0 100-18 9 9 0 000 18z"
                            />
                          </svg>
                          Comments for Author
                        </p>
                        <p class="text-gray-800 leading-relaxed">
                          {{ review.comments_for_author || "No comments yet." }}
                        </p>
                      </div>

                      <div
                        class="border border-gray-200 bg-gray-50 rounded-lg p-4"
                      >
                        <p
                          class="text-sm font-semibold text-gray-700 mb-1 flex items-center"
                        >
                          <svg
                            class="w-4 h-4 mr-1 text-indigo-500"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M5 12h14M12 5l7 7-7 7"
                            />
                          </svg>
                          Comments for Committee
                        </p>
                        <p class="text-gray-800 italic leading-relaxed">
                          {{ review.comments_committee || "N/A" }}
                        </p>
                      </div>
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
      </div>

      <p v-else class="text-gray-500 text-center mt-12 text-lg italic">
        You haven't submitted any papers yet.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue"
import axios from "axios"

const events = ref([])
const expanded = ref({})

const toggleReview = (submissionId, idx) => {
  const key = `${submissionId}-${idx}`
  expanded.value[key] = !expanded.value[key]
}

const isExpanded = (submissionId, idx) => expanded.value[`${submissionId}-${idx}`]

onMounted(async () => {
  try {
    const res = await axios.get("/users/mypapers", { withCredentials: true })
    events.value = res.data.events || []
  } catch (e) {
    console.error("Failed to load papers:", e)
  }
})
</script>
