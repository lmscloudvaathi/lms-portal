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
    return 'http://127.0.0.1:8000/api/v1'
  }
  if (!/\/api\/v1$/i.test(s)) {
    s = `${s.replace(/\/+$/, '')}/api/v1`
  }
  return s
}

// Set VITE_API_URL in frontend/.env (e.g. http://127.0.0.1:8000/api/v1 for local FastAPI).
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

export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/i, "")

export function resolveMediaUrl(url?: string | null): string {
  const value = String(url || "").trim()
  if (!value) return ""
  if (value.startsWith("data:") || value.startsWith("blob:") || /^https?:\/\//i.test(value)) return value
  return `${API_ORIGIN}${value.startsWith("/") ? value : `/${value}`}`
}

export default API_BASE_URL
