<template>
  <nav class="w-full bg-gray-900 text-gray-100 flex justify-between items-center px-6 py-3">
    <!-- Logo -->
    <h1 class="text-lg font-semibold text-yellow-400 tracking-wide">
      IRCSET
    </h1>

    <!-- Links -->
    <ul class="flex space-x-6 text-sm font-medium">
      <li>
        <RouterLink to="/" class="hover:text-yellow-400 transition-colors duration-200">
          Home
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/dashboard" class="hover:text-yellow-400 transition-colors duration-200">
          Dashboard
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/submission" class="hover:text-yellow-400 transition-colors duration-200">
          Submit
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/login" class="hover:text-yellow-400 transition-colors duration-200">
          Login
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { RouterLink } from "vue-router";
</script>
