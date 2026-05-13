// src/config.ts

/**
 * Normalizes VITE_API_URL:
 * - trims whitespace
 * - strips wrapping quotes (common in .env editors)
 * - removes trailing slashes
 * - if the value is an origin without /api/v1, appends /api/v1
 */
function normalizeApiBaseUrl(raw: string | undefined): string {
  let s = String(raw ?? '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  s = s.replace(/\/+$/, '')
  if (!s) {
    return import.meta.env.DEV ? 'http://127.0.0.1:8001/api/v1' : 'http://127.0.0.1:8000/api/v1'
  }
  if (!/\/api\/v1$/i.test(s)) {
    s = `${s.replace(/\/+$/, '')}/api/v1`
  }
  return s
}

// Set VITE_API_URL in .env (e.g. http://127.0.0.1:8001/api/v1 for local FastAPI).
// Production: set the full public API URL in your host env (Netlify, etc.).
const envUrl = import.meta.env.VITE_API_URL as string | undefined
export const API_BASE_URL = normalizeApiBaseUrl(envUrl)

/** Google OAuth Web client ID (same value as backend GOOGLE_CLIENT_ID). Optional. */
export const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .trim()

export const endpoints = {
  login: `${API_BASE_URL}/login`,
  courses: `${API_BASE_URL}/courses`,
}

export default API_BASE_URL
