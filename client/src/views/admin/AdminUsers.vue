<template>
  <div class="min-h-screen bg-slate-50 py-10 px-6 flex justify-center">
    <div class="w-full max-w-6xl bg-white border border-slate-200 rounded-2xl shadow-lg p-8">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Admin — Manage Users</h1>
          <p class="text-sm text-gray-500">View, edit, and manage system users</p>
        </div>
        <button
          @click="logout"
          class="text-sm bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition"
        >
          Logout
        </button>
      </div>

      <!-- Search + Toolbar -->
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <input
          v-model="search"
          type="text"
          placeholder="Search by name or email..."
          class="flex-1 border border-gray-300 rounded-md px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
        />
        <button
          @click="fetchUsers"
          class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition text-sm"
        >
          Refresh
        </button>
      </div>

      <!-- Error Message -->
      <div
        v-if="errorMsg"
        class="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm"
      >
        {{ errorMsg }}
      </div>

      <!-- Users Table -->
      <div class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="min-w-full text-sm text-gray-700">
          <thead class="bg-slate-100 text-gray-800 border-b">
            <tr>
              <th class="p-3 text-left font-semibold">Name</th>
              <th class="p-3 text-left font-semibold">Email</th>
              <th class="p-3 text-center font-semibold">Admin</th>
              <th class="p-3 text-center font-semibold">Status</th>
              <th class="p-3 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
              class="border-b hover:bg-slate-50 transition"
            >
              <td class="p-3 font-medium text-gray-900">{{ user.name || "—" }}</td>
              <td class="p-3 text-gray-700">{{ user.email }}</td>

              <!-- Admin toggle -->
              <td class="p-3 text-center">
                <input
                  type="checkbox"
                  v-model="user.is_admin"
                  @change="updateRole(user)"
                  class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
              </td>

              <!-- Status -->
              <td class="p-3 text-center">
                <span
                  :class="[
                    'px-2 py-1 rounded text-xs font-semibold',
                    user.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  ]"
                >
                  {{ user.is_active ? "Active" : "Locked" }}
                </span>
              </td>

              <!-- Actions -->
              <td class="p-3 text-center space-x-2">
                <button
                  @click="toggleActive(user)"
                  :class="[
                    'text-xs px-3 py-1 rounded font-medium transition',
                    user.is_active
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  ]"
                >
                  {{ user.is_active ? "Lock" : "Unlock" }}
                </button>

                <button
                  @click="openEdit(user)"
                  class="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition"
                >
                  Edit
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div
          v-if="!filteredUsers.length && !loading"
          class="text-center py-6 text-gray-500"
        >
          No users found.
        </div>

        <div v-if="loading" class="text-center py-6 text-gray-400 italic">
          Loading users...
        </div>
      </div>

      <!-- Edit Modal -->
      <div
        v-if="editModalVisible"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      >
        <div class="bg-white w-full max-w-md rounded-lg shadow-xl p-6 relative">
          <h2 class="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
            Edit User
          </h2>

          <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            v-model="editUser.name"
            class="w-full border border-gray-300 rounded-md px-3 py-2 mb-3 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />

          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            v-model="editUser.email"
            class="w-full border border-gray-300 rounded-md px-3 py-2 mb-4 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />

          <div class="flex justify-end space-x-2">
            <button
              @click="editModalVisible = false"
              class="px-3 py-1.5 text-sm rounded bg-gray-200 hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              @click="saveEdit"
              class="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import axios from "axios";

const users = ref([]);
const search = ref("");
const editModalVisible = ref(false);
const editUser = ref({});
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

onMounted(fetchUsers);

async function fetchUsers() {
  try {
    const res = await axios.get("/admin/users", { withCredentials: true });
    users.value = res.data.items || [];
  } catch (err) {
    console.error("Failed to fetch users:", err);
  }
}

const filteredUsers = computed(() =>
  users.value.filter((u) => {
    const q = search.value.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  })
);

async function updateRole(user) {
  try {
    await axios.put(
      `/admin/users/${user.id}/role`,
      { role: user.is_admin },
      { withCredentials: true }
    );
  } catch (err) {
    console.error("Failed to update role:", err);
  }
}

async function toggleActive(user) {
  try {
    const action = user.is_active ? "lock" : "unlock";
    await axios.post(`/admin/users/${user.id}/${action}`, {}, { withCredentials: true });
    user.is_active = !user.is_active;
  } catch (err) {
    console.error("Failed to toggle active state:", err);
  }
}

function openEdit(user) {
  editUser.value = { ...user };
  editModalVisible.value = true;
}

async function saveEdit() {
  try {
    await axios.put(`/admin/users/${editUser.value.id}`, editUser.value, {
      withCredentials: true,
    });
    editModalVisible.value = false;
    await fetchUsers();
  } catch (err) {
    console.error("Failed to save user:", err);
  }
}

async function logout() {
  try {
    await axios.post("/auth/logout");
    window.location.href = "/login";
  } catch {}
}
</script>
