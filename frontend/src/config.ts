// src/config.ts

// API base (must include /api/v1). Set VITE_API_URL in .env locally or in Cloudflare Pages → Settings → Environment variables for production builds.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

export const endpoints = {
  login: `${API_BASE_URL}/auth/login`,
  courses: `${API_BASE_URL}/courses`,
  // Add other endpoints here...
};

export default API_BASE_URL;