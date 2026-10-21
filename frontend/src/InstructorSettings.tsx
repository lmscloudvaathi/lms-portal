import { useEffect, useState } from "react";
import axios from "axios";
import { Lock, Save, Tag, Plus, Power } from "lucide-react";
import API_BASE_URL from './config';
import CvToast from "./components/CvToast";

type CouponRow = {
  id: number;
  code: string;
  discount_type: string;
  discount_value: number;
  course_id?: number | null;
  max_uses?: number | null;
  used_count?: number;
  min_amount?: number | null;
  is_active: boolean;
  expires_at?: string | null;
};

const InstructorSettings = () => {
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "10",
    max_uses: "",
    min_amount: "",
  });

  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
    show: false, message: "", type: "success"
  });

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  const brand = {
    blue: "var(--neon-cyan)",
    green: "var(--neon-cyan)",
    cardBg: "var(--surface)",
    border: "var(--border)",
    textMain: "var(--foreground)",
    textLight: "var(--muted-foreground)"
  };

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/coupons`, { headers: authHeaders() });
      setCoupons(res.data || []);
    } catch {
      setCoupons([]);
    } finally {
      setLoadingCoupons(false);
    }
  };

  useEffect(() => { void loadCoupons(); }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      triggerToast("Password is too short (min 6 chars)", "error");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE_URL}/user/change-password`, { new_password: newPassword }, { headers: authHeaders() });
      triggerToast("Password updated successfully!", "success");
      setNewPassword("");
    } catch {
      triggerToast("Failed to update password. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post(`${API_BASE_URL}/coupons`, {
        code: form.code.trim().toUpperCase(),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        min_amount: form.min_amount ? Number(form.min_amount) : null,
        is_active: true,
      }, { headers: authHeaders() });
      triggerToast("Coupon created!", "success");
      setForm({ code: "", discount_type: "percent", discount_value: "10", max_uses: "", min_amount: "" });
      await loadCoupons();
    } catch (err: any) {
      triggerToast(err?.response?.data?.detail || "Could not create coupon.", "error");
    } finally {
      setCreating(false);
    }
  };

  const toggleCoupon = async (coupon: CouponRow) => {
    try {
      await axios.patch(`${API_BASE_URL}/coupons/${coupon.id}`, {
        is_active: !coupon.is_active,
      }, { headers: authHeaders() });
      await loadCoupons();
      triggerToast(coupon.is_active ? "Coupon deactivated." : "Coupon activated.", "success");
    } catch (err: any) {
      triggerToast(err?.response?.data?.detail || "Could not update coupon.", "error");
    }
  };

  return (
    <div style={{ maxWidth: "760px", margin: "40px auto", animation: "fadeIn 0.3s ease", position: "relative" }}>
      <div style={{ background: brand.cardBg, borderRadius: "16px", padding: "40px", border: `1px solid ${brand.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.02)", marginBottom: "24px" }}>
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
            {saving ? "Saving..." : <><Save size={16} className="inline mr-2" /> Update Password</>}
          </button>
        </form>
      </div>

      <div style={{ background: brand.cardBg, borderRadius: "16px", padding: "40px", border: `1px solid ${brand.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "24px", paddingBottom: "20px", borderBottom: `1px solid ${brand.border}` }}>
          <div style={{ padding: "12px", background: "#ecfccb", borderRadius: "12px", color: "#4d7c0f" }}>
            <Tag size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: brand.textMain }}>Course Coupons</h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: brand.textLight }}>
              Students can apply these codes before paying for a course
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <input
            className="cv-input md:col-span-2"
            placeholder="Code (e.g. CLOUD10)"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
            required
          />
          <select
            className="cv-input"
            value={form.discount_type}
            onChange={(e) => setForm((p) => ({ ...p, discount_type: e.target.value }))}
          >
            <option value="percent">Percent off</option>
            <option value="flat">Flat ₹ off</option>
          </select>
          <input
            className="cv-input"
            type="number"
            min={1}
            placeholder={form.discount_type === "percent" ? "Percent (e.g. 10)" : "Amount (e.g. 500)"}
            value={form.discount_value}
            onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
            required
          />
          <input
            className="cv-input"
            type="number"
            min={1}
            placeholder="Max uses (optional)"
            value={form.max_uses}
            onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))}
          />
          <input
            className="cv-input"
            type="number"
            min={0}
            placeholder="Min course price ₹ (optional)"
            value={form.min_amount}
            onChange={(e) => setForm((p) => ({ ...p, min_amount: e.target.value }))}
          />
          <button type="submit" disabled={creating} className="cv-btn-primary md:col-span-2 disabled:opacity-70">
            {creating ? "Creating..." : <><Plus size={16} className="inline mr-2" /> Create Coupon</>}
          </button>
        </form>

        {loadingCoupons ? (
          <p className="text-sm text-slate-500">Loading coupons...</p>
        ) : coupons.length === 0 ? (
          <p className="text-sm text-slate-500">No coupons yet. Create one above.</p>
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-extrabold text-slate-800 tracking-wide">{c.code}</p>
                  <p className="text-xs text-slate-500">
                    {c.discount_type === "flat" ? `₹${c.discount_value} off` : `${c.discount_value}% off`}
                    {" · "}
                    used {c.used_count || 0}{c.max_uses != null ? `/${c.max_uses}` : ""}
                    {c.min_amount ? ` · min ₹${c.min_amount}` : ""}
                    {" · "}
                    <span className={c.is_active ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleCoupon(c)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Power size={14} /> {c.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CvToast
        show={toast.show}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
};

export default InstructorSettings;
