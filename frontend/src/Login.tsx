import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import API_BASE_URL, { GOOGLE_CLIENT_ID } from "./config";
import {
  User,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle,
  ShieldCheck,
  Smartphone,
  MessageSquare,
  AlertCircle,
  X,
} from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import { saveSession, isSuperAdminEmail, resolveStaffRole } from "./utils/session";

interface ToastState {
  show: boolean;
  message: string;
  type: "success" | "error";
}

type GoogleCredentialResponse = { credential?: string };
type GooglePromptNotification = {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
          prompt: (cb?: (notification: GooglePromptNotification) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const isStaffRole = (role: string) => role === "instructor" || role === "admin";

function apiErrorMessage(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { detail?: unknown } } };
  if (!ax.response) {
    return "Cannot reach the server. Check your connection and try again.";
  }
  const detail = ax.response.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object" && "msg" in detail[0]) {
    return String((detail[0] as { msg: string }).msg);
  }
  return fallback;
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="shrink-0">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

/** Custom dark button; Google iframe sits invisible on top so clicks still work (hides GIS white box). */
function LearnerGoogleButton({
  onCredential,
  onError,
  context = "signin",
}: {
  onCredential: (credential: string | undefined) => void;
  onError: () => void;
  context?: "signin" | "signup";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callbacksRef = useRef({ onCredential, onError });
  callbacksRef.current = { onCredential, onError };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !hostRef.current) return;

    let cancelled = false;
    let attempts = 0;
    const host = hostRef.current;
    setReady(false);

    const mount = () => {
      if (cancelled || !host) return;
      const gsi = window.google?.accounts?.id;
      if (!gsi) {
        if (attempts++ < 50) window.setTimeout(mount, 100);
        return;
      }

      host.innerHTML = "";
      gsi.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: GoogleCredentialResponse) => {
          callbacksRef.current.onCredential(response.credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        context,
        itp_support: true,
      });
      // Width matches the visual button; iframe stays opacity 0 so the white GIS chrome never shows.
      gsi.renderButton(host, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 348,
      });
      if (!cancelled) setReady(true);
    };

    mount();
    return () => {
      cancelled = true;
      host.innerHTML = "";
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [context]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="cv-google-login relative mb-5 h-11 w-full max-w-[350px]">
      <div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center gap-3 rounded-xl border px-4 text-sm font-semibold text-foreground"
        style={{
          background: "var(--surface-elevated)",
          borderColor: "color-mix(in oklab, var(--neon-cyan) 28%, var(--border))",
        }}
        aria-hidden
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white">
          <GoogleMark />
        </span>
        Continue with Google
      </div>
      <div
        ref={hostRef}
        className={`cv-google-login__hit absolute inset-0 z-10 overflow-hidden rounded-xl ${ready ? "opacity-[0.011]" : "opacity-0"}`}
        aria-label="Continue with Google"
        title="Continue with Google"
      />
    </div>
  );
}

const Login = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: "", type: "success" });

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [showSignupOtpInput, setShowSignupOtpInput] = useState(false);

  const [formData, setFormData] = useState({ email: "", password: "", name: "" });

  const activeBg = "bg-gradient-neon";
  const activeText = "text-gradient-neon";

  const API_URL = API_BASE_URL;

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 4500);
  };

  const completeGoogleSignIn = async (credential: string | undefined, mode: "login" | "signup") => {
    if (!credential) {
      triggerToast("Google did not return a credential. Try again.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/google/student`, { credential, mode });
      const email = String(res.data.email || "").trim();
      if (isSuperAdminEmail(email)) {
        saveSession(res.data.access_token, "admin", email);
        triggerToast("Signed in as administrator. Redirecting…", "success");
        setTimeout(() => navigate("/dashboard"), 900);
        return;
      }
      if (res.data.role !== "student") {
        triggerToast("Please use the Admin Portal for instructor access.", "error");
        return;
      }
      saveSession(res.data.access_token, res.data.role, email);
      triggerToast(
        mode === "signup" ? "Welcome! Your account is ready. Redirecting…" : "Signed in with Google. Redirecting…",
        "success"
      );
      setTimeout(() => navigate("/student-dashboard"), 900);
    } catch (err: unknown) {
      triggerToast(apiErrorMessage(err, "Google sign-in failed."), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  useEffect(() => {
    setShowSignupOtpInput(false);
    setOtp("");
  }, [isSignUp]);

  const sendEmailOtp = async () => {
    if (!formData.email?.trim() || !formData.password || !formData.name?.trim()) {
      triggerToast("Please enter your name, email, and password.", "error");
      return;
    }
    if (formData.password.length < 6) {
      triggerToast("Password must be at least 6 characters.", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/signup/send-otp`, {
        email: formData.email.trim(),
        password: formData.password,
        name: formData.name.trim(),
        phone_number: phone.trim() || undefined,
      });
      setShowSignupOtpInput(true);
      const hint = res.data?.hint ? ` ${res.data.hint}` : "";
      triggerToast(`${res.data?.message || "Verification code sent."}${hint}`, "success");
    } catch (err: unknown) {
      triggerToast(apiErrorMessage(err, "Could not send verification email."), "error");
    } finally {
      setLoading(false);
    }
  };

  const verifySignupOtp = async () => {
    const code = otp.trim().replace(/\s/g, "");
    if (code.length < 6) {
      triggerToast("Enter the 6-digit code from your email.", "error");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/signup/verify-otp`, {
        email: formData.email.trim(),
        otp: code,
      });
      triggerToast("Account created! Please sign in with your email and password.", "success");
      setIsSignUp(false);
      setShowSignupOtpInput(false);
      setOtp("");
      setPhone("");
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      triggerToast(ax.response?.data?.detail || "Verification failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  const resendEmailOtp = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/signup/resend-otp`, {
        email: formData.email.trim(),
      });
      const hint = res.data?.hint ? ` ${res.data.hint}` : "";
      triggerToast(`${res.data?.message || "Code resent."}${hint}`, "success");
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      triggerToast(ax.response?.data?.detail || "Could not resend code.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSignUp) {
      setLoading(true);
      try {
        const loginParams = new URLSearchParams();
        loginParams.append("username", formData.email);
        loginParams.append("password", formData.password);

        const res = await axios.post(`${API_URL}/login`, loginParams);
        const email = formData.email.trim();
        const role = resolveStaffRole(email, String(res.data.role || ""));
        const dest = role === "student" ? "/student-dashboard" : isStaffRole(role) ? "/dashboard" : "";
        if (!dest) {
          triggerToast("This account type cannot sign in here.", "error");
          return;
        }

        saveSession(res.data.access_token, role, email);
        triggerToast(role === "admin" ? "Welcome back, Administrator!" : "Login Successful! Redirecting...", "success");
        setTimeout(() => navigate(dest), 1000);
      } catch (err: unknown) {
        triggerToast(apiErrorMessage(err, "Authentication failed. Check credentials."), "error");
      } finally {
        setLoading(false);
      }
    } else if (!showSignupOtpInput) {
      await sendEmailOtp();
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col font-sans">
      <SiteHeader
        current="lms"
        rightSlot={
          <button
            type="button"
            onClick={() => navigate("/admin-login")}
            className="ml-1 inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary sm:px-4 sm:text-sm"
          >
            <ShieldCheck size={16} /> Admin
          </button>
        }
      />

      <main className="flex flex-1 items-center justify-center p-4 py-10">
      <div className="relative glass rounded-[20px] overflow-hidden w-full max-w-[500px] lg:max-w-[1000px] min-h-[550px] lg:min-h-[600px] flex flex-col lg:block glow-violet">
        <div
          className={`
             lg:absolute lg:top-0 lg:left-0 lg:w-1/2 lg:h-full lg:transition-all lg:duration-700 lg:ease-in-out lg:z-20
             ${isSignUp ? "hidden lg:flex lg:translate-x-full lg:opacity-0 lg:pointer-events-none" : "flex w-full h-full lg:opacity-100"}
        `}
        >
          <form
            onSubmit={handleAuth}
            className="bg-transparent flex flex-col items-center justify-center w-full h-full px-8 py-10 lg:px-12 text-center"
          >
            <div className="mb-4">
              <BrandLogo size="xl" showTagline />
            </div>
            <h1 className="mb-1 text-2xl font-bold text-foreground">Learner Login</h1>
            <p className="mb-4 text-sm text-muted-foreground">Sign in with Google or email and password</p>

            {!isSignUp && (
              <LearnerGoogleButton
                context="signin"
                onCredential={(c) => void completeGoogleSignIn(c, "login")}
                onError={() => triggerToast("Google sign-in was cancelled or failed.", "error")}
              />
            )}

            <div className="mb-6 flex w-full items-center">
              <div className="h-px flex-1 bg-border"></div>
              <span className="px-3 text-xs font-medium text-muted-foreground">OR USE EMAIL</span>
              <div className="h-px flex-1 bg-border"></div>
            </div>

            <div className="w-full max-w-[350px] space-y-4">
              <div className="flex items-center rounded-xl border border-border bg-[var(--input)] px-4 py-3 transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary/40">
                <Mail className="mr-3 shrink-0 text-muted-foreground" size={20} strokeWidth={1.5} />
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  required
                  className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                  onChange={handleInputChange}
                />
              </div>
              <div className="flex items-center rounded-xl border border-border bg-[var(--input)] px-4 py-3 transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary/40">
                <Lock className="mr-3 shrink-0 text-muted-foreground" size={20} strokeWidth={1.5} />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  required
                  className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`mt-6 flex w-full max-w-[350px] transform items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-primary-foreground shadow-lg transition-all active:scale-95 ${activeBg} hover:opacity-90`}
            >
              {loading ? "Signing In..." : "Sign In"} <ArrowRight size={18} />
            </button>

            <div className="mt-8 lg:hidden">
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <span
                  onClick={() => setIsSignUp(true)}
                  className="cursor-pointer font-bold text-primary"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => ev.key === "Enter" && setIsSignUp(true)}
                >
                  Sign Up
                </span>
              </p>
            </div>
          </form>
        </div>

        <div
          className={`
            lg:absolute lg:top-0 lg:left-0 lg:w-1/2 lg:h-full lg:transition-all lg:duration-700 lg:ease-in-out lg:z-10
            ${isSignUp ? "flex w-full h-full lg:translate-x-full lg:opacity-100 lg:z-30" : "hidden lg:flex lg:opacity-0 lg:pointer-events-none"}
        `}
        >
          {!showSignupOtpInput ? (
            <form
              onSubmit={handleAuth}
              className="bg-transparent flex flex-col items-center justify-center w-full h-full px-8 py-10 lg:px-12 text-center"
            >
              <h1 className={`mb-2 text-3xl font-bold ${activeText}`}>Create Account</h1>
              <p className="mb-3 max-w-[350px] text-sm text-muted-foreground">
                Register with Google (instant), or use email—we&apos;ll send a verification code.
              </p>

              {isSignUp && !showSignupOtpInput && (
                <LearnerGoogleButton
                  context="signup"
                  onCredential={(c) => void completeGoogleSignIn(c, "signup")}
                  onError={() => triggerToast("Google sign-in was cancelled or failed.", "error")}
                />
              )}

              <div className="mx-auto mb-5 flex w-full max-w-[350px] items-center">
                <div className="h-px flex-1 bg-border" />
                <span className="px-3 text-xs font-medium text-muted-foreground">OR EMAIL</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="w-full max-w-[350px] space-y-4">
                <div className="flex items-center rounded-xl border border-border bg-[var(--input)] px-4 py-3 transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary/40">
                  <User className="mr-3 shrink-0 text-muted-foreground" size={20} strokeWidth={1.5} />
                  <input
                    type="text"
                    name="name"
                    placeholder="Full Name"
                    required
                    className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                    onChange={handleInputChange}
                  />
                </div>
                <div className="flex items-center rounded-xl border border-border bg-[var(--input)] px-4 py-3 transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary/40">
                  <Mail className="mr-3 shrink-0 text-muted-foreground" size={20} strokeWidth={1.5} />
                  <input
                    type="email"
                    name="email"
                    placeholder="Email Address"
                    required
                    className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                    onChange={handleInputChange}
                  />
                </div>
                <div className="flex items-center rounded-xl border border-border bg-[var(--input)] px-4 py-3 transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary/40">
                  <Lock className="mr-3 shrink-0 text-muted-foreground" size={20} strokeWidth={1.5} />
                  <input
                    type="password"
                    name="password"
                    placeholder="Create Password (min. 6 characters)"
                    required
                    minLength={6}
                    className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                    onChange={handleInputChange}
                  />
                </div>
                <div className="flex items-center rounded-xl border border-border bg-[var(--input)] px-4 py-3 transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary/40">
                  <Smartphone className="mr-3 shrink-0 text-muted-foreground" size={20} strokeWidth={1.5} />
                  <input
                    type="tel"
                    value={phone}
                    placeholder="Mobile number (optional)"
                    className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <p className="mt-4 w-full max-w-[350px] text-left text-xs leading-relaxed text-muted-foreground">
                After you tap &quot;Get verification code&quot;, check your inbox. If nothing arrives within a minute,
                look in your <strong className="text-foreground">Spam</strong> or <strong className="text-foreground">Junk</strong> folder—automated messages are often filtered
                there.
              </p>

              <button
                type="submit"
                disabled={loading}
                className={`mt-6 flex w-full max-w-[350px] transform items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-primary-foreground shadow-lg transition-all active:scale-95 ${activeBg} hover:opacity-90`}
              >
                {loading ? "Sending code..." : "Get verification code"} <CheckCircle size={18} />
              </button>

              <div className="mt-8 lg:hidden">
                <p className="text-sm text-muted-foreground">
                  Already a member?{" "}
                  <span
                    onClick={() => setIsSignUp(false)}
                    className="cursor-pointer font-bold text-primary"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => ev.key === "Enter" && setIsSignUp(false)}
                  >
                    Sign In
                  </span>
                </p>
              </div>
            </form>
          ) : (
            <div className="flex h-full w-full animate-fade-in flex-col items-center justify-center bg-transparent px-8 py-10 text-center lg:px-12">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-[var(--surface-elevated)]">
                <MessageSquare className="text-primary" size={32} />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-foreground">Verify your email</h2>
              <p className="mb-2 text-sm text-muted-foreground">
                Enter the 6-digit code sent to <span className="font-semibold text-foreground">{formData.email}</span>
              </p>
              <p className="mb-6 max-w-[320px] text-xs leading-relaxed text-muted-foreground">
                Didn&apos;t get the email? Wait a minute, then check <strong className="text-foreground">Spam</strong> or <strong className="text-foreground">Junk</strong>. You
                can resend a new code below (wait at least 60 seconds between sends).
              </p>

              <div className="mb-6 w-full max-w-[250px]">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full border-b-2 border-border bg-transparent py-3 text-center text-3xl font-bold tracking-widest text-foreground outline-none focus:border-primary"
                />
              </div>

              <button
                type="button"
                onClick={verifySignupOtp}
                disabled={loading}
                className={`flex w-full max-w-[250px] transform items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-primary-foreground shadow-lg transition-all active:scale-95 ${activeBg} hover:opacity-90`}
              >
                {loading ? "Verifying..." : "Verify & create account"}
              </button>

              <button
                type="button"
                onClick={resendEmailOtp}
                disabled={loading}
                className="mt-3 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Resend code
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSignupOtpInput(false);
                  setOtp("");
                }}
                className="mt-4 text-xs font-bold text-muted-foreground hover:underline"
              >
                Edit details
              </button>
            </div>
          )}
        </div>

        <div
          className={`hidden lg:block absolute top-0 left-1/2 w-1/2 h-full overflow-hidden transition-transform duration-700 ease-in-out z-40 ${isSignUp ? "-translate-x-full rounded-r-[20px] rounded-l-[100px]" : "rounded-l-[20px] rounded-r-[100px]"}`}
        >
          <div
            className={`relative -left-full h-full w-[200%] transition-transform duration-700 ease-in-out ${activeBg} text-white ${isSignUp ? "translate-x-1/2" : "translate-x-0"}`}
          >
            <div
              className={`absolute top-0 right-0 w-1/2 h-full flex flex-col items-center justify-center px-12 text-center transition-transform duration-700 ease-in-out ${isSignUp ? "translate-x-[20%]" : "translate-x-0"}`}
            >
              <h1 className="text-4xl font-extrabold mb-4 leading-tight">
                Learn Without <br />
                Limits.
              </h1>
              <p className="text-sm font-medium mb-8 italic opacity-90 max-w-[320px]">
                “Education is the passport to the future, for tomorrow belongs to those who prepare for it today.”
              </p>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className="px-8 py-3 bg-transparent border-2 border-white rounded-xl font-bold text-sm tracking-wide hover:bg-white hover:text-slate-900 transition-all active:scale-95"
              >
                Create Account
              </button>
            </div>

            <div
              className={`absolute top-0 left-0 w-1/2 h-full flex flex-col items-center justify-center px-12 text-center transition-transform duration-700 ease-in-out ${isSignUp ? "translate-x-0" : "-translate-x-[20%]"}`}
            >
              <h1 className="text-4xl font-extrabold mb-4">
                Already a <br />
                Member?
              </h1>
              <p className="text-sm font-medium mb-8 opacity-90 max-w-[320px]">
                Sign in to your dashboard and continue your learning journey.
              </p>
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="px-8 py-3 bg-transparent border-2 border-white rounded-xl font-bold text-sm tracking-wide hover:bg-white hover:text-slate-900 transition-all active:scale-95"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
      </main>
      <SiteFooter />

      {toast.show && (
        <div
          className="cv-toast fixed right-5 top-5 z-50 flex max-w-sm items-center gap-3 border-l-4 animate-fade-in"
          style={{ borderColor: toast.type === "success" ? "var(--success)" : "var(--danger)" }}
        >
          {toast.type === "success" ? (
            <CheckCircle className="shrink-0 text-[var(--success)]" size={24} />
          ) : (
            <AlertCircle className="shrink-0 text-[var(--danger)]" size={24} />
          )}
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-foreground">
              {toast.type === "success" ? "Success" : "Error"}
            </h4>
            <p className="break-words text-xs text-muted-foreground">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast({ ...toast, show: false })}
            className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Login;
