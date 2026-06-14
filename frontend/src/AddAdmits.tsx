import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from './config';
import {
  UserPlus, Upload, FileSpreadsheet, CheckCircle,
  Download, AlertCircle, X, Shield
} from "lucide-react";

// Types
interface Course {
  id: number;
  title: string;
}

const AddAdmits = () => {
  // --- STATE ---
  const [courses, setCourses] = useState<Course[]>([]);

  // Single Admit State
  const [singleName, setSingleName] = useState("");
  const [singleEmail, setSingleEmail] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [singleLoading, setSingleLoading] = useState(false);

  // Bulk Admit State
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkCourseId, setBulkCourseId] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Create Instructor Modal State
  const [showInstructorModal, setShowInstructorModal] = useState(false);
  const [instName, setInstName] = useState("");
  const [instEmail, setInstEmail] = useState("");
  const [instPhone, setInstPhone] = useState("");
  const [instPassword, setInstPassword] = useState("");

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ ...toast, show: false }), 3000);
  };

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${API_BASE_URL}/courses`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCourses(res.data);
      } catch (err) { console.error("Error fetching courses", err); }
    };
    fetchCourses();
  }, []);

  // Handle Create Instructor
  const handleCreateInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE_URL}/users`, {
        email: instEmail,
        password: instPassword,
        name: instName,
        phone_number: instPhone,
        role: "instructor"
      });
      triggerToast("👨‍🏫 New Instructor Created Successfully!", "success");
      setShowInstructorModal(false);
      setInstName(""); setInstEmail(""); setInstPhone(""); setInstPassword("");
    } catch (err: any) {
      triggerToast("Failed to create instructor. Email might exist.", "error");
    }
  };

  const handleSingleAdmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCourseIds.length === 0) return triggerToast("Please select at least one course.", "error");
    setSingleLoading(true);

    // ✅ Generate Random Password Frontend-side
    const generatedPassword = Math.random().toString(36).slice(-8) + "1!";

    try {
      const token = localStorage.getItem("token");
      // ✅ Included password in payload so backend can email it
      const payload = {
        full_name: singleName,
        email: singleEmail,
        course_ids: selectedCourseIds,
        password: generatedPassword
      };

      await axios.post(`${API_BASE_URL}/admin/admit-student`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      triggerToast(`Account created for ${singleEmail}. They can sign in with Google or email.`, "success");
      setSingleName(""); setSingleEmail(""); setSelectedCourseIds([]);
    } catch (err: any) { triggerToast(`Error: ${err.response?.data?.detail || "Failed"}`, "error"); }
    finally { setSingleLoading(false); }
  };

  const handleBulkAdmit = async () => {
    if (!bulkFile || !bulkCourseId) return triggerToast("Missing file or course selection.", "error");
    setBulkLoading(true);
    const formData = new FormData();
    formData.append("file", bulkFile);
    formData.append("course_id", bulkCourseId.toString());
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(`${API_BASE_URL}/admin/bulk-admit`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
      });
      const created = res.data?.created_users ?? 0;
      const enrolled = res.data?.enrolled ?? 0;
      triggerToast(`Created ${created} account(s), enrolled ${enrolled} student(s). They can sign in with Google.`, "success");
      setBulkFile(null);
    } catch (err: any) { triggerToast("Upload failed", "error"); }
    finally { setBulkLoading(false); }
  };

  const toggleCourseSelection = (id: number) => {
    if (selectedCourseIds.includes(id)) { setSelectedCourseIds(selectedCourseIds.filter(cid => cid !== id)); }
    else { setSelectedCourseIds([...selectedCourseIds, id]); }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,name,email\nJohn Doe,john@college.edu";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "student_template.csv");
    document.body.appendChild(link); link.click();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-10 animate-fade-in">

      {/* HEADER WITH NEW INSTRUCTOR BUTTON */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-10">
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#1e293b] m-0">Add Admits</h1>

        <button
          onClick={() => setShowInstructorModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#1e293b] text-white rounded-xl font-bold text-sm hover:bg-slate-700 transition-colors shadow-lg shadow-slate-300"
        >
          <Shield size={18} /> Create Instructor
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
        {/* LEFT: SINGLE ADMIT */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
          <div className="border-b border-slate-100 pb-5 mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-[#1e293b]">
              <UserPlus size={24} className="text-[#005EB8]" /> Single Student Admit
            </h2>
            <p className="text-slate-500 text-sm mt-1.5 font-medium">Create account & assign free courses manually.</p>
          </div>
          <form onSubmit={handleSingleAdmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
              <input
                required
                value={singleName}
                onChange={e => setSingleName(e.target.value)}
                placeholder="Student Name"
                className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:border-[#005EB8] focus:ring-1 focus:ring-[#005EB8] outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
              <input
                required
                type="email"
                value={singleEmail}
                onChange={e => setSingleEmail(e.target.value)}
                placeholder="student@college.edu"
                className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:border-[#005EB8] focus:ring-1 focus:ring-[#005EB8] outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assign Free Courses</label>
              <div className="border border-slate-200 rounded-xl max-h-[150px] overflow-y-auto p-2 bg-[#f8fafc]">
                {courses.map(course => (
                  <div
                    key={course.id}
                    onClick={() => toggleCourseSelection(course.id)}
                    className={`p-2.5 mb-1 rounded-lg cursor-pointer flex items-center gap-3 transition-colors ${selectedCourseIds.includes(course.id) ? "bg-[#e0f2fe]" : "hover:bg-slate-100"}`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedCourseIds.includes(course.id) ? "bg-[#005EB8] border-[#005EB8]" : "bg-white border-slate-300"}`}>
                      {selectedCourseIds.includes(course.id) && <CheckCircle size={10} color="white" />}
                    </div>
                    <span className={`text-sm font-semibold ${selectedCourseIds.includes(course.id) ? "text-[#005EB8]" : "text-slate-700"}`}>{course.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              disabled={singleLoading}
              type="submit"
              className="w-full py-3.5 bg-[#005EB8] text-white rounded-xl font-bold text-sm hover:bg-[#004e9a] transition-all flex justify-center items-center shadow-md shadow-blue-100 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {singleLoading ? "Processing..." : "Create Account & Send Email"}
            </button>
          </form>
        </div>

        {/* RIGHT: BULK ADMIT */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm flex flex-col h-full">
          <div className="border-b border-slate-100 pb-5 mb-6 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1e293b]">
                <FileSpreadsheet size={24} className="text-[#87C232]" /> Bulk Upload
              </h2>
              <p className="text-slate-500 text-sm mt-1.5 font-medium">Upload Excel to onboard a whole batch.</p>
            </div>
            <button
              onClick={downloadTemplate}
              className="text-xs font-bold text-[#005EB8] flex items-center gap-1.5 hover:underline bg-transparent border-none cursor-pointer"
            >
              <Download size={14} /> Template
            </button>
          </div>
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Batch Course</label>
              <div className="relative">
                <select
                  value={bulkCourseId || ""}
                  onChange={(e) => setBulkCourseId(Number(e.target.value))}
                  className="w-full p-3 pl-4 text-sm rounded-lg border border-slate-300 bg-white outline-none focus:border-[#87C232] focus:ring-1 focus:ring-[#87C232] transition-all appearance-none text-slate-700 font-medium"
                >
                  <option value="">-- Choose Course for Batch --</option>
                  {courses.map(c => (<option key={c.id} value={c.id}>{c.title}</option>))}
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </div>
              </div>
            </div>
            <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center min-h-[200px] bg-[#f8fafc] relative hover:bg-slate-50 transition-colors group">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setBulkFile(e.target.files ? e.target.files[0] : null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {bulkFile ? (
                <div className="text-center animate-fade-in">
                  <FileSpreadsheet size={48} className="text-[#87C232] mx-auto mb-2" />
                  <div className="font-bold text-slate-700">{bulkFile.name}</div>
                  <div className="text-xs text-slate-400 mt-1">Click to change file</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="bg-white p-3 rounded-full shadow-sm mb-3 mx-auto w-fit group-hover:scale-110 transition-transform">
                    <Upload size={24} className="text-slate-400" />
                  </div>
                  <div className="font-bold text-slate-600">Drop Excel File Here</div>
                  <div className="text-xs text-slate-400 mt-1">or click to browse</div>
                </div>
              )}
            </div>
            <button
              disabled={bulkLoading}
              onClick={handleBulkAdmit}
              className="w-full py-3.5 bg-[#87C232] text-white rounded-xl font-bold text-sm hover:bg-[#76a928] transition-all shadow-md shadow-green-100 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {bulkLoading ? "Processing..." : "Process Batch Upload"}
            </button>
          </div>
        </div>
      </div>

      {/* CREATE INSTRUCTOR MODAL */}
      {showInstructorModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white w-full max-w-md p-6 md:p-8 rounded-2xl shadow-2xl animate-scale-up">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-extrabold text-[#1e293b]">Create New Instructor</h2>
              <button onClick={() => setShowInstructorModal(false)} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateInstructor} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
                <input required value={instName} onChange={e => setInstName(e.target.value)} className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:border-[#1e293b] focus:ring-1 focus:ring-[#1e293b] outline-none transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email</label>
                <input required type="email" value={instEmail} onChange={e => setInstEmail(e.target.value)} className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:border-[#1e293b] focus:ring-1 focus:ring-[#1e293b] outline-none transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Phone Number</label>
                <input required type="tel" value={instPhone} onChange={e => setInstPhone(e.target.value)} className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:border-[#1e293b] focus:ring-1 focus:ring-[#1e293b] outline-none transition-all" placeholder="+91 9999999999" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                <input required type="password" value={instPassword} onChange={e => setInstPassword(e.target.value)} className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:border-[#1e293b] focus:ring-1 focus:ring-[#1e293b] outline-none transition-all" />
              </div>
              <button type="submit" className="w-full py-3.5 bg-[#1e293b] text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all mt-2 shadow-lg shadow-slate-200">Generate Credentials</button>
            </form>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 bg-white p-4 rounded-xl shadow-2xl border-l-4 flex items-center gap-3 animate-slide-in ${toast.type === "success" ? "border-green-500" : "border-red-500"}`}>
          {toast.type === "success" ? <CheckCircle size={24} className="text-green-500" /> : <AlertCircle size={24} className="text-red-500" />}
          <div>
            <h4 className="font-bold text-[#1e293b] text-sm mb-0.5">{toast.type === "success" ? "Success" : "Error"}</h4>
            <p className="text-xs text-slate-500 m-0">{toast.message}</p>
          </div>
          <button onClick={() => setToast({ ...toast, show: false })} className="ml-2 text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={16} /></button>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scale-up { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in { animation: slideIn 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default AddAdmits;