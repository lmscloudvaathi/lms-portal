const TOKEN_KEY = "token";
const ROLE_KEY = "role";
const EMAIL_KEY = "email";
const LOGIN_AT_KEY = "login_at";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export const SUPER_ADMIN_EMAIL = "jagathishwaranparthiban@iqmath.in";
export const SUPER_ADMIN_EMAILS = [
  SUPER_ADMIN_EMAIL,
  "lmscloudvaathi@gmail.com",
];

export type SessionData = {
  token: string;
  role: string;
  email?: string;
  loginAt: number;
};

export const isSuperAdminEmail = (email?: string | null): boolean =>
  SUPER_ADMIN_EMAILS.includes(String(email || "").trim().toLowerCase());

export const resolveStaffRole = (email: string | undefined, apiRole: string): string =>
  isSuperAdminEmail(email) ? "admin" : apiRole;

export const saveSession = (token: string, role: string, email?: string) => {
  const resolvedRole = resolveStaffRole(email, role);
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, resolvedRole);
  localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
  if (email) localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(LOGIN_AT_KEY);
};

export const getValidSession = (): SessionData | null => {
  const token = localStorage.getItem(TOKEN_KEY);
  const role = localStorage.getItem(ROLE_KEY);
  const email = localStorage.getItem(EMAIL_KEY) || undefined;
  const loginAtRaw = localStorage.getItem(LOGIN_AT_KEY);
  const loginAt = Number(loginAtRaw);

  if (!token || !role || !Number.isFinite(loginAt)) {
    clearSession();
    return null;
  }

  if (Date.now() - loginAt > SESSION_TTL_MS) {
    clearSession();
    return null;
  }

  return { token, role: resolveStaffRole(email, role), email, loginAt };
};

export const isStudentSession = (): boolean => getValidSession()?.role === "student";
export const isStaffSession = (): boolean => {
  const session = getValidSession();
  if (!session) return false;
  return session.role === "instructor" || session.role === "admin" || isSuperAdminEmail(session.email);
};
