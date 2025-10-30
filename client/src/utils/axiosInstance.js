import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '', // your API base path
  withCredentials: true, // IMPORTANT: send cookies
});

let csrfToken = null;

// Fetch CSRF token once and cache it
const getCsrfToken = async () => {
  if (!csrfToken) {
    const res = await api.get('/api/auth/csrf-token');
    csrfToken = res.data.csrfToken;
  }
  return csrfToken;
};

// Request interceptor to attach token to mutating requests
api.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase();

  // Only attach token to mutating requests (POST, PUT, PATCH, DELETE)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await getCsrfToken();
    config.headers['X-CSRF-Token'] = token;
  }

  return config;
}, (error) => Promise.reject(error));

export default api;
