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
        <h1 className="text-2xl md:text-3xl font-extrabold m-0">Add Admits</h1>

        <button
          onClick={() => setShowInstructorModal(true)}
          className="cv-btn-primary"
        >
          <Shield size={18} /> Create Instructor
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
        <div className="cv-card p-6 md:p-8">
          <div className="border-b border-border pb-5 mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 m-0">
              <UserPlus size={22} className="text-primary" /> Single Student Admit
            </h2>
            <p className="text-muted-foreground text-sm mt-1.5 font-medium">Create an account and assign free courses.</p>
          </div>
          <form onSubmit={handleSingleAdmit} className="flex flex-col gap-5">
            <div>
              <label className="cv-label">Full Name</label>
              <input
                required
                value={singleName}
                onChange={e => setSingleName(e.target.value)}
                placeholder="Student Name"
                className="cv-input"
              />
            </div>
            <div>
              <label className="cv-label">Email Address</label>
              <input
                required
                type="email"
                value={singleEmail}
                onChange={e => setSingleEmail(e.target.value)}
                placeholder="student@college.edu"
                className="cv-input"
              />
            </div>
            <div>
              <label className="cv-label">Assign Free Courses</label>
              <div className="cv-checklist">
                {courses.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">No courses available yet.</p>
                ) : (
                  courses.map(course => {
                    const selected = selectedCourseIds.includes(course.id);
                    return (
                      <button
                        type="button"
                        key={course.id}
                        onClick={() => toggleCourseSelection(course.id)}
                        className={`cv-check-row ${selected ? "is-selected" : ""}`}
                      >
                        <span className="cv-check">
                          {selected && <CheckCircle size={12} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{course.title}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <button
              disabled={singleLoading}
              type="submit"
              className="cv-btn-primary w-full disabled:opacity-70"
            >
              {singleLoading ? "Processing..." : "Create Account & Send Email"}
            </button>
          </form>
        </div>

        <div className="cv-card p-6 md:p-8 flex flex-col h-full">
          <div className="border-b border-border pb-5 mb-6 flex justify-between items-start gap-3">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 m-0">
                <FileSpreadsheet size={22} className="text-primary" /> Bulk Upload
              </h2>
              <p className="text-muted-foreground text-sm mt-1.5 font-medium">Upload Excel to onboard a whole batch.</p>
            </div>
            <button
              onClick={downloadTemplate}
              className="cv-btn-ghost !px-3 !py-2 text-xs shrink-0"
            >
              <Download size={14} /> Template
            </button>
          </div>
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <label className="cv-label">Select Batch Course</label>
              <select
                value={bulkCourseId || ""}
                onChange={(e) => setBulkCourseId(Number(e.target.value))}
                className="cv-input cv-select"
              >
                <option value="">Choose course for batch</option>
                {courses.map(c => (<option key={c.id} value={c.id}>{c.title}</option>))}
              </select>
            </div>
            <label className={`cv-dropzone flex-1 min-h-[200px] ${bulkFile ? "is-dragging" : ""}`}>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setBulkFile(e.target.files ? e.target.files[0] : null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {bulkFile ? (
                <div className="text-center pointer-events-none">
                  <FileSpreadsheet size={40} className="text-primary mx-auto mb-2" />
                  <div className="font-bold">{bulkFile.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">Click to change file</div>
                </div>
              ) : (
                <div className="text-center pointer-events-none">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-neon text-primary-foreground mx-auto mb-3">
                    <Upload size={22} />
                  </span>
                  <div className="font-bold">Drop Excel file here</div>
                  <div className="text-xs text-muted-foreground mt-1">or click to browse · CSV, XLS, XLSX</div>
                </div>
              )}
            </label>
            <button
              disabled={bulkLoading}
              onClick={handleBulkAdmit}
              className="cv-btn-primary w-full disabled:opacity-70"
            >
              {bulkLoading ? "Processing..." : "Process Batch Upload"}
            </button>
          </div>
        </div>
      </div>

      {/* CREATE INSTRUCTOR MODAL */}
      {showInstructorModal && (
        <div className="cv-modal-overlay" onClick={() => setShowInstructorModal(false)}>
          <div className="cv-modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="cv-modal-header flex items-center justify-between">
              <h2 className="m-0 text-xl font-extrabold">Create New Instructor</h2>
              <button onClick={() => setShowInstructorModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-white/10">
                <X size={20} />
              </button>
            </div>
            <form id="create-instructor-form" onSubmit={handleCreateInstructor} className="cv-modal-body flex flex-col gap-4">
              <div>
                <label className="cv-label">Name</label>
                <input required value={instName} onChange={e => setInstName(e.target.value)} className="cv-input" placeholder="Instructor name" />
              </div>
              <div>
                <label className="cv-label">Email</label>
                <input required type="email" value={instEmail} onChange={e => setInstEmail(e.target.value)} className="cv-input" placeholder="instructor@college.edu" />
              </div>
              <div>
                <label className="cv-label">Phone Number</label>
                <input required type="tel" value={instPhone} onChange={e => setInstPhone(e.target.value)} className="cv-input" placeholder="+91 9999999999" />
              </div>
              <div>
                <label className="cv-label">Password</label>
                <input required type="password" value={instPassword} onChange={e => setInstPassword(e.target.value)} className="cv-input" placeholder="Temporary password" />
              </div>
            </form>
            <div className="cv-modal-footer">
              <button type="button" onClick={() => setShowInstructorModal(false)} className="cv-btn-ghost flex-1 !rounded-xl">Cancel</button>
              <button type="submit" form="create-instructor-form" className="cv-btn-primary flex-1 !rounded-xl">Generate Credentials</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast.show && (
        <div className={`cv-toast ${toast.type === "success" ? "border-l-4 border-l-green-400" : "border-l-4 border-l-red-400"}`}>
          {toast.type === "success" ? <CheckCircle size={22} className="text-green-400" /> : <AlertCircle size={22} className="text-red-400" />}
          <div>
            <h4 className="font-bold text-sm mb-0.5 m-0">{toast.type === "success" ? "Success" : "Error"}</h4>
            <p className="text-xs text-muted-foreground m-0">{toast.message}</p>
          </div>
          <button onClick={() => setToast({ ...toast, show: false })} className="ml-1 border-none bg-transparent text-muted-foreground"><X size={16} /></button>
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