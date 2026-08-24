import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Award, CheckCircle2, ShieldX } from "lucide-react";
import API_BASE_URL from "./config";
import BrandLogo from "./components/BrandLogo";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import ThemeBackdrop from "./components/ThemeBackdrop";

type VerifyPayload = {
  valid?: boolean;
  credential_id?: string;
  recipient_name?: string;
  course_title?: string;
  issued_at?: string | null;
};

function formatIssued(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function VerifyCertificate() {
  const { credentialId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<VerifyPayload | null>(null);

  useEffect(() => {
    const id = (credentialId || "").trim();
    if (!id) {
      setError("Missing certificate ID.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${API_BASE_URL}/certificates/verify/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || "This certificate could not be verified.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [credentialId]);

  return (
    <div className="min-h-screen flex flex-col">
      <ThemeBackdrop />
      <SiteHeader current="lms" />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl glass text-foreground rounded-3xl border border-border shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <BrandLogo size="md" imageOnly />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">Cloud Vaathi</p>
              <h1 className="text-xl font-extrabold">Certificate verification</h1>
            </div>
          </div>

          {loading && <p className="text-slate-500 font-medium">Checking this credential…</p>}

          {!loading && error && (
            <div className="text-center py-6">
              <ShieldX className="mx-auto text-red-500 mb-3" size={40} />
              <p className="font-extrabold text-slate-800 mb-1">Not verified</p>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          )}

          {!loading && data?.valid && (
            <div>
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-6">
                <CheckCircle2 size={18} />
                <span className="text-sm font-bold">Valid Cloud Vaathi certificate</span>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Awarded to</p>
                  <p className="text-2xl font-extrabold text-[#C9A227]">{data.recipient_name}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Course</p>
                  <p className="font-bold text-slate-800">{data.course_title}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Certificate No</p>
                    <p className="font-mono text-sm font-bold">{data.credential_id}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Issued</p>
                    <p className="text-sm font-bold">{formatIssued(data.issued_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Link to="/" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#005EB8]">
            <Award size={16} /> Back to LMS
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
