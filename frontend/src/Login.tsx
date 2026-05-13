import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import API_BASE_URL, { GOOGLE_CLIENT_ID } from "./config";
import { GoogleLogin } from "@react-oauth/google";
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
import { saveSession } from "./utils/session";

interface ToastState {
  show: boolean;
  message: string;
  type: "success" | "error";
}

/** Single Google button; mount in only one panel at a time to avoid duplicate GSI init. */
function LearnerGoogleButton({
  onCredential,
  onError,
}: {
  onCredential: (credential: string | undefined) => void;
  onError: () => void;
}) {
  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="w-full max-w-[350px] flex justify-center mb-5">
      <GoogleLogin
        onSuccess={(res) => onCredential(res.credential)}
        onError={onError}
        useOneTap={false}
        theme="outline"
        text="continue_with"
        shape="rectangular"
        size="large"
        width={340}
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

  const activeBg = isSignUp ? "bg-[#87C232]" : "bg-[#005EB8]";
  const activeText = isSignUp ? "text-[#87C232]" : "text-[#005EB8]";

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
      if (res.data.role !== "student") {
        triggerToast("Please use the Admin Portal for instructor access.", "error");
        return;
      }
      saveSession(res.data.access_token, res.data.role);
      triggerToast(
        mode === "signup" ? "Welcome! Your account is ready. Redirecting…" : "Signed in with Google. Redirecting…",
        "success"
      );
      setTimeout(() => navigate("/student-dashboard"), 900);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      triggerToast(ax.response?.data?.detail || "Google sign-in failed.", "error");
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
      const ax = err as { response?: { data?: { detail?: string } } };
      triggerToast(ax.response?.data?.detail || "Could not send verification email.", "error");
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

        if (res.data.role !== "student") {
          triggerToast("Please use the Admin Portal for Instructor access.", "error");
          setLoading(false);
          return;
        }
        saveSession(res.data.access_token, res.data.role);
        triggerToast("Login Successful! Redirecting...", "success");
        setTimeout(() => navigate("/student-dashboard"), 1000);
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { detail?: string } } };
        triggerToast(ax.response?.data?.detail || "Authentication failed. Check credentials.", "error");
      } finally {
        setLoading(false);
      }
    } else if (!showSignupOtpInput) {
      await sendEmailOtp();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#E2E8F0] font-sans p-4 overflow-hidden relative">
      <button
        type="button"
        onClick={() => navigate("/admin-login")}
        className="absolute top-4 right-4 lg:top-6 lg:right-6 flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-white rounded-full shadow-md text-slate-600 hover:text-[#005EB8] hover:shadow-lg transition-all z-50 font-bold text-xs lg:text-sm border border-slate-200"
      >
        <ShieldCheck size={16} className="lg:w-[18px] lg:h-[18px]" /> Admin Access
      </button>

      <div className="relative bg-[#F8FAFC] rounded-[20px] shadow-2xl overflow-hidden w-full max-w-[500px] lg:max-w-[1000px] min-h-[550px] lg:min-h-[600px] flex border border-slate-200 flex-col lg:block">
        <div
          className={`
             lg:absolute lg:top-0 lg:left-0 lg:w-1/2 lg:h-full lg:transition-all lg:duration-700 lg:ease-in-out lg:z-20
             ${isSignUp ? "hidden lg:flex lg:translate-x-full lg:opacity-0 lg:pointer-events-none" : "flex w-full h-full lg:opacity-100"}
        `}
        >
          <form
            onSubmit={handleAuth}
            className="bg-[#F8FAFC] flex flex-col items-center justify-center w-full h-full px-8 py-10 lg:px-12 text-center"
          >
            <div className="mb-4">
              <BrandLogo size="xl" showTagline />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Learner Login</h1>
            <p className="text-slate-400 text-sm mb-4">Sign in with Google or email and password</p>

            {!isSignUp && (
              <LearnerGoogleButton
                onCredential={(c) => void completeGoogleSignIn(c, "login")}
                onError={() => triggerToast("Google sign-in was cancelled or failed.", "error")}
              />
            )}

            <div className="flex items-center w-full mb-6">
              <div className="h-px bg-slate-200 flex-1"></div>
              <span className="px-3 text-xs text-slate-400 font-medium">OR USE EMAIL</span>
              <div className="h-px bg-slate-200 flex-1"></div>
            </div>

            <div className="w-full max-w-[350px] space-y-4">
              <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#005EB8] focus-within:ring-opacity-50 transition-all shadow-sm">
                <Mail className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  required
                  className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400"
                  onChange={handleInputChange}
                />
              </div>
              <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#005EB8] focus-within:ring-opacity-50 transition-all shadow-sm">
                <Lock className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  required
                  className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400"
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`mt-6 w-full max-w-[350px] py-3.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${activeBg} hover:opacity-90`}
            >
              {loading ? "Signing In..." : "Sign In"} <ArrowRight size={18} />
            </button>

            <div className="mt-8 lg:hidden">
              <p className="text-sm text-slate-500">
                Don&apos;t have an account?{" "}
                <span
                  onClick={() => setIsSignUp(true)}
                  className="font-bold text-[#005EB8] cursor-pointer"
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
              className="bg-[#F8FAFC] flex flex-col items-center justify-center w-full h-full px-8 py-10 lg:px-12 text-center"
            >
              <h1 className={`text-3xl font-bold mb-2 ${activeText}`}>Create Account</h1>
              <p className="text-slate-400 text-sm mb-3 max-w-[350px]">
                Register with Google (instant), or use email—we&apos;ll send a verification code.
              </p>

              {isSignUp && !showSignupOtpInput && (
                <LearnerGoogleButton
                  onCredential={(c) => void completeGoogleSignIn(c, "signup")}
                  onError={() => triggerToast("Google sign-in was cancelled or failed.", "error")}
                />
              )}

              <div className="flex items-center w-full max-w-[350px] mx-auto mb-5">
                <div className="h-px bg-slate-200 flex-1" />
                <span className="px-3 text-xs text-slate-400 font-medium">OR EMAIL</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>

              <div className="w-full max-w-[350px] space-y-4">
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <User className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input
                    type="text"
                    name="name"
                    placeholder="Full Name"
                    required
                    className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400"
                    onChange={handleInputChange}
                  />
                </div>
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <Mail className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input
                    type="email"
                    name="email"
                    placeholder="Email Address"
                    required
                    className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400"
                    onChange={handleInputChange}
                  />
                </div>
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <Lock className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input
                    type="password"
                    name="password"
                    placeholder="Create Password (min. 6 characters)"
                    required
                    minLength={6}
                    className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400"
                    onChange={handleInputChange}
                  />
                </div>
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <Smartphone className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input
                    type="tel"
                    value={phone}
                    placeholder="Mobile number (optional)"
                    className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400"
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <p className="mt-4 max-w-[350px] text-xs text-slate-500 leading-relaxed text-left w-full">
                After you tap &quot;Get verification code&quot;, check your inbox. If nothing arrives within a minute,
                look in your <strong>Spam</strong> or <strong>Junk</strong> folder—automated messages are often filtered
                there.
              </p>

              <button
                type="submit"
                disabled={loading}
                className={`mt-6 w-full max-w-[350px] py-3.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${activeBg} hover:opacity-90`}
              >
                {loading ? "Sending code..." : "Get verification code"} <CheckCircle size={18} />
              </button>

              <div className="mt-8 lg:hidden">
                <p className="text-sm text-slate-500">
                  Already a member?{" "}
                  <span
                    onClick={() => setIsSignUp(false)}
                    className="font-bold text-[#005EB8] cursor-pointer"
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
            <div className="bg-[#F8FAFC] flex flex-col items-center justify-center h-full px-8 py-10 lg:px-12 text-center w-full animate-fade-in">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="text-[#87C232]" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Verify your email</h2>
              <p className="text-slate-500 text-sm mb-2">
                Enter the 6-digit code sent to <span className="font-semibold text-slate-700">{formData.email}</span>
              </p>
              <p className="text-slate-500 text-xs mb-6 max-w-[320px] leading-relaxed">
                Didn&apos;t get the email? Wait a minute, then check <strong>Spam</strong> or <strong>Junk</strong>. You
                can resend a new code below (wait at least 60 seconds between sends).
              </p>

              <div className="w-full max-w-[250px] mb-6">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full text-center text-3xl font-bold tracking-widest py-3 border-b-2 border-slate-300 focus:border-[#87C232] outline-none bg-transparent"
                />
              </div>

              <button
                type="button"
                onClick={verifySignupOtp}
                disabled={loading}
                className={`w-full max-w-[250px] py-3.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${activeBg} hover:opacity-90`}
              >
                {loading ? "Verifying..." : "Verify & create account"}
              </button>

              <button
                type="button"
                onClick={resendEmailOtp}
                disabled={loading}
                className="mt-3 text-sm text-[#005EB8] font-semibold hover:underline disabled:opacity-50"
              >
                Resend code
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSignupOtpInput(false);
                  setOtp("");
                }}
                className="mt-4 text-xs text-slate-400 font-bold hover:underline"
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

      {toast.show && (
        <div
          className="fixed top-5 right-5 z-50 bg-white px-6 py-4 rounded-xl shadow-2xl border-l-4 border-l-current flex items-center gap-3 animate-fade-in max-w-sm"
          style={{ borderColor: toast.type === "success" ? "#87C232" : "#ef4444" }}
        >
          {toast.type === "success" ? (
            <CheckCircle className="text-[#87C232] shrink-0" size={24} />
          ) : (
            <AlertCircle className="text-red-500 shrink-0" size={24} />
          )}
          <div className="min-w-0">
            <h4 className="font-bold text-slate-800 text-sm">
              {toast.type === "success" ? "Success" : "Error"}
            </h4>
            <p className="text-slate-500 text-xs break-words">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast({ ...toast, show: false })}
            className="ml-2 text-slate-400 hover:text-slate-600 shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Login;
