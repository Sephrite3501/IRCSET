<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center py-12">
    <h1 class="text-2xl font-semibold text-gray-800 mb-8">Submit Paper</h1>

    <!-- Drop Zone -->
    <div
      class="w-4/5 max-w-2xl h-48 border-2 border-dashed border-gray-400 rounded-xl flex items-center justify-center bg-white shadow-sm transition-all duration-300 hover:border-indigo-400 hover:shadow-md relative"
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
        multiple
        class="absolute inset-0 opacity-0 cursor-pointer"
        @change="handleFileSelect"
      />
    </div>

    <!-- File Preview -->
    <div v-if="files.length" class="mt-8 w-4/5 max-w-3xl">
      <!-- View toggle buttons -->
      <div class="flex justify-end mb-4 space-x-2">
        <button
          @click="viewMode = 'grid'"
          :class="[
            'px-3 py-1 rounded-md text-sm font-medium transition',
            viewMode === 'grid'
              ? 'bg-indigo-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          ]"
        >
          Grid
        </button>
        <button
          @click="viewMode = 'list'"
          :class="[
            'px-3 py-1 rounded-md text-sm font-medium transition',
            viewMode === 'list'
              ? 'bg-indigo-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          ]"
        >
          List
        </button>
      </div>

      <!-- Grid view -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="(file, i) in files"
          :key="i"
          class="p-4 rounded-lg bg-white shadow border border-gray-200 hover:border-indigo-400 transition-all"
        >
          <div class="text-2xl mb-2">📄</div>
          <p class="text-gray-800 font-medium truncate">{{ file.name }}</p>
          <p class="text-gray-500 text-sm">{{ formatSize(file.size) }}</p>
        </div>
      </div>

      <!-- List view -->
      <table
        v-else
        class="w-full border border-gray-300 rounded-lg overflow-hidden text-sm shadow-sm bg-white"
      >
        <thead class="bg-gray-100 text-gray-700">
          <tr>
            <th class="text-left p-3">File Name</th>
            <th class="text-left p-3 w-32">Size</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(file, i) in files"
            :key="i"
            class="border-t border-gray-200 hover:bg-gray-50 transition"
          >
            <td class="p-3 truncate">{{ file.name }}</td>
            <td class="p-3">{{ formatSize(file.size) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const files = ref([]);
const isDragging = ref(false);
const viewMode = ref("grid");

function handleDrop(e) {
  isDragging.value = false;
  files.value.push(...e.dataTransfer.files);
}

function handleFileSelect(e) {
  files.value.push(...e.target.files);
}

function formatSize(size) {
  const kb = size / 1024;
  const mb = kb / 1024;
  return mb > 1 ? mb.toFixed(2) + " MB" : kb.toFixed(2) + " KB";
}
</script>
