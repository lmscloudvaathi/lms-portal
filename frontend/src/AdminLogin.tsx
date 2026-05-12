import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Lock, Mail, ArrowRight, CheckCircle, GraduationCap, AlertCircle, X, ShieldCheck, Eye, EyeOff, Facebook, Github, Linkedin } from "lucide-react";
import API_BASE_URL from './config';
import { saveSession } from "./utils/session";
// Google Icon
const GoogleIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>);

interface ToastState { show: boolean; message: string; type: "success" | "error"; }

const AdminLogin = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: "", type: "success" });

  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const gradientText = "bg-clip-text text-transparent bg-gradient-to-r from-[#005EB8] to-[#87C232]";
  const gradientBg = "bg-gradient-to-r from-[#005EB8] to-[#87C232]";
  const borderFocus = "focus-within:ring-2 focus-within:ring-[#005EB8] focus-within:border-transparent";

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loginParams = new URLSearchParams();
      loginParams.append("username", formData.email);
      loginParams.append("password", formData.password);

      const res = await axios.post(`${API_BASE_URL}/login`, loginParams);

      if (res.data.role !== "instructor" && res.data.role !== "admin") {
        triggerToast("Access Denied. This portal is for instructors and administrators only.", "error");
        setLoading(false); return;
      }
      saveSession(res.data.access_token, res.data.role);
      triggerToast(res.data.role === "admin" ? "Welcome back, Administrator!" : "Welcome back, Instructor!", "success");
      setTimeout(() => navigate("/dashboard"), 1000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (!err?.response) {
        triggerToast("Backend unreachable. Ensure API is running.", "error");
      } else {
        triggerToast(detail || "Authentication failed. Check credentials.", "error");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#E2E8F0] font-sans p-4 overflow-hidden relative">
      <button onClick={() => navigate("/")} className="absolute top-4 right-4 lg:top-6 lg:right-6 flex items-center gap-2 px-3 py-1.5 lg:px-5 lg:py-2.5 bg-white rounded-full shadow-md text-slate-600 hover:text-[#005EB8] hover:shadow-lg transition-all z-50 font-bold text-xs lg:text-sm border border-slate-200">
        <GraduationCap size={16} className="lg:w-[18px] lg:h-[18px]" /> Learner Portal
      </button>

      {/* Decorative Blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#005EB8]/5 blur-[100px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#87C232]/5 blur-[100px]"></div>

      <div className="relative bg-[#F8FAFC] rounded-2xl shadow-2xl w-full max-w-[450px] p-6 lg:p-10 border border-slate-200 z-10">
        <div className="flex flex-col items-center text-center">
          <div className="mb-2 flex items-center justify-center p-3 bg-white rounded-2xl border border-slate-100 shadow-sm"><ShieldCheck size={32} className="text-[#005EB8]" /></div>

          <h1 className="text-3xl font-extrabold text-slate-800 mt-4 mb-2">Instructor Access</h1>
          <p className="text-slate-500 text-sm mb-6 px-4">Secure login for faculty and administration.</p>

          {/* SOCIAL LOGIN */}
          <div className="flex gap-4 mb-6 w-full justify-center">
            <button type="button" className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm"><GoogleIcon /></button>
            <button type="button" className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm text-[#1877F2]"><Facebook size={20} fill="currentColor" strokeWidth={0} /></button>
            <button type="button" className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm text-slate-800"><Github size={20} /></button>
            <button type="button" className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm text-[#0A66C2]"><Linkedin size={20} fill="currentColor" strokeWidth={0} /></button>
          </div>

          <div className="flex items-center w-full mb-6">
            <div className="h-px bg-slate-200 flex-1"></div>
            <span className="px-3 text-xs text-slate-400 font-medium">OR USE EMAIL</span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>

          <form onSubmit={handleAuth} className="w-full space-y-5">
            <div className={`flex items-center bg-white rounded-xl px-4 py-3.5 border border-slate-200 transition-all ${borderFocus} shadow-sm`}>
              <Mail className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
              <input type="email" name="email" placeholder="Instructor Email" required className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400" onChange={handleInputChange} />
            </div>

            <div className={`flex items-center bg-white rounded-xl px-4 py-3.5 border border-slate-200 transition-all ${borderFocus} shadow-sm`}>
              <Lock className="text-slate-400 mr-3 shrink-0" size={20} strokeWidth={1.5} />
              <input
                type={showPassword ? "text" : "password"}
                name="password" placeholder="Password" required
                className="bg-transparent outline-none flex-1 text-sm font-medium text-slate-700 placeholder-slate-400"
                onChange={handleInputChange}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-[#005EB8] focus:outline-none transition-colors ml-2 shrink-0">
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <button type="submit" disabled={loading} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg shadow-blue-500/30 transition-all transform active:scale-95 flex items-center justify-center gap-2 mt-4 ${gradientBg} hover:opacity-90`}>
              {loading ? "Verifying..." : "Access Dashboard"} <ArrowRight size={18} />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200 w-full">
            <p className="text-xs text-slate-400 font-medium">Need an account? Contact the <span className={`font-bold cursor-pointer hover:underline ${gradientText}`}>University IT Admin</span>.</p>
          </div>
        </div>
      </div>
      {toast.show && (<div className="fixed top-5 right-5 z-50 bg-white px-6 py-4 rounded-xl shadow-2xl border-l-4 border-l-current flex items-center gap-3 animate-fade-in" style={{ borderColor: toast.type === "success" ? "#87C232" : "#ef4444" }}>{toast.type === "success" ? <CheckCircle className="text-[#87C232]" size={24} /> : <AlertCircle className="text-red-500" size={24} />}<div><h4 className="font-bold text-slate-800 text-sm">{toast.type === "success" ? "Success" : "Error"}</h4><p className="text-slate-500 text-xs">{toast.message}</p></div><button onClick={() => setToast({ ...toast, show: false })} className="ml-2 text-slate-400 hover:text-slate-600"><X size={16} /></button></div>)}
    </div>
  );
};

export default AdminLogin;