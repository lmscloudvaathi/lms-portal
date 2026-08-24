import { useState } from "react";
import axios from "axios";
import { Lock, Save, CheckCircle, AlertCircle, X } from "lucide-react"; // ✅ Added Icons
import API_BASE_URL from './config';
const InstructorSettings = () => {
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ NEW: Toast State
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({ 
    show: false, message: "", type: "success" 
  });

  // ✅ NEW: Toast Helper
  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  // 🎨 PROFESSIONAL THEME
  const brand = { 
    blue: "var(--neon-cyan)", 
    green: "var(--neon-cyan)",
    cardBg: "var(--surface)", 
    border: "var(--border)",
    textMain: "var(--foreground)",
    textLight: "var(--muted-foreground)"
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ Replaced Alert
    if (newPassword.length < 6) {
        triggerToast("Password is too short (min 6 chars)", "error");
        return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
     await axios.post(`${API_BASE_URL}/user/change-password`, { new_password: newPassword }, { headers: { Authorization: `Bearer ${token}` } });     
      // ✅ Replaced Alert
      triggerToast("Password updated successfully!", "success");
      setNewPassword("");
    } catch (err) { 
        // ✅ Replaced Alert
        triggerToast("Failed to update password. Please try again.", "error"); 
    } finally { 
        setSaving(false); 
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "40px auto", animation: "fadeIn 0.3s ease", position: "relative" }}>
        <div style={{ background: brand.cardBg, borderRadius: "16px", padding: "40px", border: `1px solid ${brand.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
            
            <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "30px", paddingBottom: "20px", borderBottom: `1px solid ${brand.border}` }}>
                <div style={{ padding: "12px", background: "#e0f2fe", borderRadius: "12px", color: brand.blue }}>
                    <Lock size={24} />
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: brand.textMain }}>Security Settings</h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: brand.textLight }}>Update your instructor account password</p>
                </div>
            </div>

            <form onSubmit={handlePasswordChange}>
                <div style={{ marginBottom: "24px" }}>
                    <label className="cv-label">New Password</label>
                    <input 
                        type="password" required minLength={6} 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        placeholder="Enter a strong password (min 6 characters)" 
                        className="cv-input"
                    />
                </div>
                <button type="submit" disabled={saving} className="cv-btn-primary w-full disabled:opacity-70">
                    <Save size={18} /> {saving ? "Updating..." : "Update Password"}
                </button>
            </form>

        </div>

        {/* ✅ NEW: TOAST NOTIFICATION COMPONENT */}
        {toast.show && (
            <div style={{ 
                position: "fixed", top: "20px", right: "20px", 
                background: "white", padding: "16px 24px", borderRadius: "12px", 
                boxShadow: "0 10px 30px -5px rgba(0,0,0,0.15)", 
                borderLeft: `6px solid ${toast.type === "success" ? brand.green : "#ef4444"}`,
                display: "flex", alignItems: "center", gap: "12px", zIndex: 9999,
                animation: "slideIn 0.3s ease-out"
            }}>
                {toast.type === "success" ? <CheckCircle size={24} color={brand.green} /> : <AlertCircle size={24} color="#ef4444" />}
                <div>
                    <h4 style={{ margin: "0", fontSize: "14px", fontWeight: "700", color: brand.textMain }}>
                        {toast.type === "success" ? "Success" : "Error"}
                    </h4>
                    <p style={{ margin: 0, fontSize: "13px", color: brand.textLight }}>{toast.message}</p>
                </div>
                <button onClick={() => setToast(prev => ({ ...prev, show: false }))} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "10px", color: "#94a3b8" }}>
                    <X size={16} />
                </button>
            </div>
        )}
    </div>
  );
};

export default InstructorSettings;