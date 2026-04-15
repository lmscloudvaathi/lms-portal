import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from './config';
import {
  User, Lock, Mail, ArrowRight, CheckCircle,
  ShieldCheck,
  Smartphone, MessageSquare, AlertCircle, X
} from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import { saveSession } from "./utils/session";

// 🔥 FIREBASE IMPORTS
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const looksLikePlaceholder = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  return (
    s === "" ||
    s.includes("replace_me") ||
    s.startsWith("your_") ||
    s === "your_firebase_api_key" ||
    s === "your_sender_id" ||
    s === "your_app_id" ||
    s === "your_measurement_id"
  );
};

const FIREBASE_CONFIGURED = Boolean(
  !looksLikePlaceholder(firebaseConfig.apiKey) &&
  !looksLikePlaceholder(firebaseConfig.authDomain) &&
  !looksLikePlaceholder(firebaseConfig.projectId) &&
  !looksLikePlaceholder(firebaseConfig.messagingSenderId) &&
  !looksLikePlaceholder(firebaseConfig.appId)
);

const getFirebaseAuthSafe = () => {
  if (!FIREBASE_CONFIGURED) return null;
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    auth.useDeviceLanguage();
    return auth;
  } catch (err) {
    console.error("Firebase init failed:", err);
    return null;
  }
};

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier | null;
    recaptchaWidgetId?: number;
    recaptchaContainerId?: string;
    grecaptcha?: { reset: (widgetId?: number) => void };
  }
}

// Google Icon Component
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

interface ToastState { show: boolean; message: string; type: "success" | "error"; }

const Login = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const role = "student";
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: "", type: "success" });

  // OTP flow is only for signup verification
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [showSignupOtpInput, setShowSignupOtpInput] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [isCaptchaSolved, setIsCaptchaSolved] = useState(false);

  const [formData, setFormData] = useState({ email: "", password: "", name: "" });

  const activeBg = isSignUp ? "bg-[#87C232]" : "bg-[#005EB8]";
  const activeText = isSignUp ? "text-[#87C232]" : "text-[#005EB8]";

  // ✅ API URL FROM ENV
  const API_URL = API_BASE_URL;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };
  const triggerToast = (message: string, type: "success" | "error" = "success") => { setToast({ show: true, message, type }); setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000); };
  const getRecaptchaContainerId = () => (isSignUp ? "recaptcha-container-signup" : "recaptcha-container-signin");

  const ensureRecaptcha = async () => {
    const targetId = getRecaptchaContainerId();

    if (window.recaptchaVerifier) {
      if (window.recaptchaContainerId === targetId) {
        // Reuse existing widget as-is. Do not reset here, otherwise user
        // is forced to solve captcha again right after clicking Get OTP.
        return window.recaptchaVerifier;
      }
      try { window.recaptchaVerifier.clear(); } catch { }
      window.recaptchaVerifier = null;
      window.recaptchaWidgetId = undefined;
      window.recaptchaContainerId = undefined;
    }
    try {
      const container = document.getElementById(targetId);
      if (!container) return null;
      container.innerHTML = "";

      const auth = getFirebaseAuthSafe();
      if (!auth) {
        triggerToast("Firebase OTP is not configured. Update frontend environment values.", "error");
        return null;
      }
      window.recaptchaVerifier = new RecaptchaVerifier(auth, targetId, {
        size: "normal",
        callback: () => {
          setIsCaptchaSolved(true);
          console.log("Captcha Verified");
        },
        'expired-callback': () => {
          setIsCaptchaSolved(false);
          triggerToast("Captcha expired. Please solve it again.", "error");
        }
      });
      window.recaptchaWidgetId = await window.recaptchaVerifier.render();
      window.recaptchaContainerId = targetId;
      return window.recaptchaVerifier;
    } catch (err) {
      console.error("Recaptcha Init Error:", err);
      return null;
    }
  };

  useEffect(() => {
    setShowSignupOtpInput(false);
    setOtp("");
    setConfirmationResult(null);
    setIsCaptchaSolved(false);
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch { }
      window.recaptchaVerifier = null;
    }
    window.recaptchaWidgetId = undefined;
    window.recaptchaContainerId = undefined;

    const signInContainer = document.getElementById("recaptcha-container-signin");
    if (signInContainer) signInContainer.innerHTML = "";
    const signUpContainer = document.getElementById("recaptcha-container-signup");
    if (signUpContainer) signUpContainer.innerHTML = "";
    if (isSignUp) void ensureRecaptcha();
  }, [isSignUp]);

  // Signup OTP
  const sendSignupOtp = async () => {
    if (!FIREBASE_CONFIGURED) {
      triggerToast("Firebase OTP is not configured. Update frontend .env values.", "error");
      return;
    }
    if (!phone || phone.length < 10) return triggerToast("Please enter a valid phone number", "error");

    setLoading(true);

    // Auto-add +91 if user didn't type country code
    const phoneNumber = phone.startsWith("+") ? phone : "+91" + phone;

    try {
      const appVerifier = await ensureRecaptcha();
      if (!appVerifier) {
        setLoading(false);
        triggerToast("Captcha init failed. Refresh and try again.", "error");
        return;
      }
      if (!isCaptchaSolved) {
        setLoading(false);
        triggerToast("Please complete CAPTCHA before sending OTP.", "error");
        return;
      }

      const auth = getFirebaseAuthSafe();
      if (!auth) {
        throw new Error("Firebase auth unavailable");
      }
      const confirmation = await Promise.race([
        signInWithPhoneNumber(auth, phoneNumber, appVerifier),
        new Promise((_, reject) => setTimeout(() => reject(new Error("OTP request timeout")), 30000))
      ]) as any;

      // Save result
      setConfirmationResult(confirmation);
      (window as any).confirmationResult = confirmation;

      setLoading(false);
      setShowSignupOtpInput(true);
      triggerToast("OTP sent successfully.", "success");

    } catch (error: any) {
      console.error("SMS Error:", error);
      setLoading(false);

      // Reset Captcha so they can try again
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch { }
        window.recaptchaVerifier = null;
      }
      setIsCaptchaSolved(false);
      const container = document.getElementById(getRecaptchaContainerId());
      if (container) container.innerHTML = "";

      if (error.code === 'auth/invalid-phone-number') {
        triggerToast("Invalid Phone Number Format.", "error");
      } else if (error.code === 'auth/argument-error') {
        triggerToast("Firebase configuration error. Check .env Firebase keys.", "error");
      } else if (error.code === "auth/invalid-app-credential") {
        triggerToast("Invalid app credential: complete CAPTCHA, add this domain in Firebase Authorized Domains, disable ad-block/shields, and retry.", "error");
      } else if (error.code === 'auth/too-many-requests' || error.code === 'auth/quota-exceeded') {
        triggerToast("Too many attempts. For development, use Firebase test phone numbers (no real SMS is sent).", "error");
      } else {
        triggerToast("SMS Failed: " + error.message, "error");
      }
    }
  };

  const verifySignupOtp = async () => {
    if (!otp) return;

    setLoading(true);

    // Safety check to ensure the SMS was actually sent
    if (!confirmationResult) {
      triggerToast("Session expired. Please request a new OTP.", "error");
      setLoading(false);
      return;
    }

    confirmationResult.confirm(otp).then(async () => {
      setLoading(false);
      triggerToast("Phone Verified!", "success");
      await finalizeSignup();
    }).catch((error: any) => {
      setLoading(false);
      console.error("Verification Error:", error);
      triggerToast("Invalid OTP. Please try again.", "error");
    });
  };
  // Final account creation after OTP verification
  const finalizeSignup = async () => {
    try {
      await axios.post(`${API_URL}/users`, {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        role: role,
        phone_number: phone
      });
      triggerToast("Account created successfully! Please Sign In.", "success");

      // Reset Everything & Go to Login View
      setIsSignUp(false);
      setShowSignupOtpInput(false);
      setOtp("");
      setPhone("");
      setConfirmationResult(null);
    } catch (err: any) {
      triggerToast(err.response?.data?.detail || "Registration Failed. Email may exist.", "error");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    // Login is email + password only
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
      } catch (err: any) {
        triggerToast(err.response?.data?.detail || "Authentication failed. Check credentials.", "error");
      } finally {
        setLoading(false);
      }
    }
    // Signup uses OTP
    else {
      if (!showSignupOtpInput) {
        await sendSignupOtp();
      } else {
        await verifySignupOtp();
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#E2E8F0] font-sans p-4 overflow-hidden relative">
      <button onClick={() => navigate("/admin-login")} className="absolute top-4 right-4 lg:top-6 lg:right-6 flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-white rounded-full shadow-md text-slate-600 hover:text-[#005EB8] hover:shadow-lg transition-all z-50 font-bold text-xs lg:text-sm border border-slate-200">
        <ShieldCheck size={16} className="lg:w-[18px] lg:h-[18px]" /> Admin Access
      </button>

      <div className="relative bg-[#F8FAFC] rounded-[20px] shadow-2xl overflow-hidden w-full max-w-[500px] lg:max-w-[1000px] min-h-[550px] lg:min-h-[600px] flex border border-slate-200 flex-col lg:block">

        {/* ======================= */}
        {/* 🔑 SIGN IN FORM (LEFT)  */}
        {/* ======================= */}
        {/* Mobile: Show if NOT signUp. Desktop: Always present but hidden via opacity/transform logic */}
        <div className={`
             lg:absolute lg:top-0 lg:left-0 lg:w-1/2 lg:h-full lg:transition-all lg:duration-700 lg:ease-in-out lg:z-20
             ${isSignUp ? 'hidden lg:flex lg:translate-x-full lg:opacity-0 lg:pointer-events-none' : 'flex w-full h-full lg:opacity-100'}
        `}>
          <form onSubmit={handleAuth} className="bg-[#F8FAFC] flex flex-col items-center justify-center w-full h-full px-8 py-10 lg:px-12 text-center">
            <div className="mb-4"><BrandLogo size="xl" showTagline /></div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Learner Login</h1>
            <p className="text-slate-400 text-sm mb-6">Sign in using email and password</p>

            <div className="flex gap-4 mb-6 w-full justify-center">
              <button type="button" className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm"><GoogleIcon /></button>
            </div>

            <div className="flex items-center w-full mb-6">
              <div className="h-px bg-slate-200 flex-1"></div><span className="px-3 text-xs text-slate-400 font-medium">OR USE EMAIL</span><div className="h-px bg-slate-200 flex-1"></div>
            </div>

            <div className="w-full max-w-[350px] space-y-4">
              <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#005EB8] focus-within:ring-opacity-50 transition-all shadow-sm">
                <Mail className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                <input type="email" name="email" placeholder="Email Address" required className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400" onChange={handleInputChange} />
              </div>
              <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#005EB8] focus-within:ring-opacity-50 transition-all shadow-sm">
                <Lock className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                <input type="password" name="password" placeholder="Password" required className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400" onChange={handleInputChange} />
              </div>
            </div>
            <button type="submit" disabled={loading} className={`mt-6 w-full max-w-[350px] py-3.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${activeBg} hover:opacity-90`}>{loading ? "Signing In..." : "Sign In"} <ArrowRight size={18} /></button>

            {/* MOBILE ONLY SWITCH */}
            <div className="mt-8 lg:hidden">
              <p className="text-sm text-slate-500">Don't have an account? <span onClick={() => setIsSignUp(true)} className="font-bold text-[#005EB8] cursor-pointer">Sign Up</span></p>
            </div>
          </form>
        </div>

        {/* ============================ */}
        {/* 📝 SIGN UP FORM (RIGHT)      */}
        {/* ============================ */}
        {/* Mobile: Show if signUp. Desktop: Always present but hidden via opacity/transform logic */}
        <div className={`
            lg:absolute lg:top-0 lg:left-0 lg:w-1/2 lg:h-full lg:transition-all lg:duration-700 lg:ease-in-out lg:z-10
            ${isSignUp ? 'flex w-full h-full lg:translate-x-full lg:opacity-100 lg:z-30' : 'hidden lg:flex lg:opacity-0 lg:pointer-events-none'}
        `}>

          {/* STATE A: DETAILS FORM (Before OTP) */}
          {!showSignupOtpInput ? (
            <form onSubmit={handleAuth} className="bg-[#F8FAFC] flex flex-col items-center justify-center w-full h-full px-8 py-10 lg:px-12 text-center">
              <h1 className={`text-3xl font-bold mb-2 ${activeText}`}>Create Account</h1>
              <p className="text-slate-400 text-sm mb-6">Enter details to verify & join</p>

              <div className="w-full max-w-[350px] space-y-4">
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <User className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input type="text" name="name" placeholder="Full Name" required className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400" onChange={handleInputChange} />
                </div>
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <Mail className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input type="email" name="email" placeholder="Email Address" required className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400" onChange={handleInputChange} />
                </div>
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <Lock className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input type="password" name="password" placeholder="Create Password" required className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400" onChange={handleInputChange} />
                </div>
                {/* 📱 PHONE INPUT FOR OTP */}
                <div className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 focus-within:ring-2 focus-within:ring-[#87C232] shadow-sm">
                  <Smartphone className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
                  <input type="tel" value={phone} placeholder="Phone (e.g. 9999999999)" required className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400" onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              {!showSignupOtpInput && (
                <div className="w-full max-w-[350px] mt-4 flex justify-center">
                  <div id="recaptcha-container-signup"></div>
                </div>
              )}

              <button type="submit" className={`mt-8 w-full max-w-[350px] py-3.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${activeBg} hover:opacity-90`}>
                {loading ? "Sending OTP..." : "Get OTP & Sign Up"} <CheckCircle size={18} />
              </button>
              {!showSignupOtpInput && !isCaptchaSolved && (
                <p className="mt-2 text-xs text-slate-500 font-medium">Complete CAPTCHA, then click Get OTP.</p>
              )}

              {/* MOBILE ONLY SWITCH */}
              <div className="mt-8 lg:hidden">
                <p className="text-sm text-slate-500">Already a member? <span onClick={() => setIsSignUp(false)} className="font-bold text-[#005EB8] cursor-pointer">Sign In</span></p>
              </div>
            </form>
          ) : (
            /* STATE B: OTP VERIFICATION FORM */
            <div className="bg-[#F8FAFC] flex flex-col items-center justify-center h-full px-8 py-10 lg:px-12 text-center w-full animate-fade-in">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="text-[#87C232]" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Verify OTP</h2>
              <p className="text-slate-500 text-sm mb-6">Enter the 6-digit code sent to {phone}</p>

              <div className="w-full max-w-[250px] mb-6">
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full text-center text-3xl font-bold tracking-widest py-3 border-b-2 border-slate-300 focus:border-[#87C232] outline-none bg-transparent"
                />
              </div>

              <button onClick={verifySignupOtp} disabled={loading} className={`w-full max-w-[250px] py-3.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${activeBg} hover:opacity-90`}>
                {loading ? "Verifying..." : "Verify & Create"}
              </button>
              <button onClick={() => setShowSignupOtpInput(false)} className="mt-4 text-xs text-slate-400 font-bold hover:underline">Change Number</button>
            </div>
          )}
        </div>

        {/* ============================ */}
        {/* 🎭 SLIDING OVERLAY PANEL     */}
        {/* ============================ */}
        {/* HIDDEN ON MOBILE */}
        <div className={`hidden lg:block absolute top-0 left-1/2 w-1/2 h-full overflow-hidden transition-transform duration-700 ease-in-out z-40 ${isSignUp ? '-translate-x-full rounded-r-[20px] rounded-l-[100px]' : 'rounded-l-[20px] rounded-r-[100px]'}`}>
          <div className={`relative -left-full h-full w-[200%] transition-transform duration-700 ease-in-out ${activeBg} text-white ${isSignUp ? 'translate-x-1/2' : 'translate-x-0'}`}>

            {/* OVERLAY: RIGHT (Prompts Sign Up) */}
            <div className={`absolute top-0 right-0 w-1/2 h-full flex flex-col items-center justify-center px-12 text-center transition-transform duration-700 ease-in-out ${isSignUp ? 'translate-x-[20%]' : 'translate-x-0'}`}>
              <h1 className="text-4xl font-extrabold mb-4 leading-tight">Learn Without <br />Limits.</h1>
              <p className="text-sm font-medium mb-8 italic opacity-90 max-w-[320px]">“Education is the passport to the future, for tomorrow belongs to those who prepare for it today.”</p>
              <button onClick={() => setIsSignUp(true)} className="px-8 py-3 bg-transparent border-2 border-white rounded-xl font-bold text-sm tracking-wide hover:bg-white hover:text-slate-900 transition-all active:scale-95">Create Account</button>
            </div>

            {/* OVERLAY: LEFT (Prompts Sign In) */}
            <div className={`absolute top-0 left-0 w-1/2 h-full flex flex-col items-center justify-center px-12 text-center transition-transform duration-700 ease-in-out ${isSignUp ? 'translate-x-0' : '-translate-x-[20%]'}`}>
              <h1 className="text-4xl font-extrabold mb-4">Already a <br />Member?</h1>
              <p className="text-sm font-medium mb-8 opacity-90 max-w-[320px]">Sign in to your dashboard and continue your learning journey.</p>
              <button onClick={() => setIsSignUp(false)} className="px-8 py-3 bg-transparent border-2 border-white rounded-xl font-bold text-sm tracking-wide hover:bg-white hover:text-slate-900 transition-all active:scale-95">Sign In</button>
            </div>

          </div>
        </div>

      </div>

      {toast.show && (<div className="fixed top-5 right-5 z-50 bg-white px-6 py-4 rounded-xl shadow-2xl border-l-4 border-l-current flex items-center gap-3 animate-fade-in" style={{ borderColor: toast.type === "success" ? "#87C232" : "#ef4444" }}>{toast.type === "success" ? <CheckCircle className="text-[#87C232]" size={24} /> : <AlertCircle className="text-red-500" size={24} />}<div><h4 className="font-bold text-slate-800 text-sm">{toast.type === "success" ? "Success" : "Error"}</h4><p className="text-slate-500 text-xs">{toast.message}</p></div><button onClick={() => setToast({ ...toast, show: false })} className="ml-2 text-slate-400 hover:text-slate-600"><X size={16} /></button></div>)}
    </div>
  );
};

export default Login;