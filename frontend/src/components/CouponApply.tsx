import { useState } from "react";
import axios from "axios";
import { Tag, CheckCircle2, X } from "lucide-react";
import API_BASE_URL from "../config";

export type AppliedCoupon = {
  code: string;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  is_free: boolean;
  message?: string;
};

type Props = {
  courseId: number;
  coursePrice: number;
  applied: AppliedCoupon | null;
  onApplied: (coupon: AppliedCoupon | null) => void;
  disabled?: boolean;
};

export default function CouponApply({ courseId, coursePrice, applied, onApplied, disabled }: Props) {
  const [code, setCode] = useState(applied?.code || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const applyCoupon = async () => {
    if (!code.trim()) {
      setError("Enter a coupon code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${API_BASE_URL}/coupons/validate`,
        { course_id: courseId, coupon_code: code.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onApplied({
        code: res.data.code,
        original_amount: res.data.original_amount,
        discount_amount: res.data.discount_amount,
        final_amount: res.data.final_amount,
        is_free: Boolean(res.data.is_free),
        message: res.data.message,
      });
      setCode(res.data.code);
    } catch (err: any) {
      onApplied(null);
      setError(err?.response?.data?.detail || "Could not apply coupon.");
    } finally {
      setLoading(false);
    }
  };

  const clearCoupon = () => {
    setCode("");
    setError("");
    onApplied(null);
  };

  const displayOriginal = applied?.original_amount ?? coursePrice;
  const displayFinal = applied?.final_amount ?? coursePrice;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Tag size={14} /> Have a coupon?
      </div>

      {!applied ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            disabled={disabled || loading}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && void applyCoupon()}
            placeholder="Enter code"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold tracking-wide text-slate-800 outline-none focus:border-[#005EB8]"
          />
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => void applyCoupon()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "..." : "Apply"}
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-sm font-bold text-green-700">
              <CheckCircle2 size={16} /> {applied.code}
            </p>
            <p className="text-xs text-green-700/80">{applied.message || `You save ₹${applied.discount_amount}`}</p>
          </div>
          <button type="button" onClick={clearCoupon} className="text-green-700 hover:text-green-900" aria-label="Remove coupon">
            <X size={16} />
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-3">
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400">Payable</p>
          <div className="flex items-baseline gap-2">
            {applied && applied.discount_amount > 0 && (
              <span className="text-sm font-bold text-slate-400 line-through">₹{displayOriginal}</span>
            )}
            <span className="text-xl font-extrabold text-[#005EB8]">
              {displayFinal <= 0 ? "Free" : `₹${displayFinal}`}
            </span>
          </div>
        </div>
        {applied && applied.discount_amount > 0 && (
          <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-bold text-green-700">
            −₹{applied.discount_amount}
          </span>
        )}
      </div>
    </div>
  );
}
