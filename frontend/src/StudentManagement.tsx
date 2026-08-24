import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from './config';
import { Trash2, User, Search, AlertCircle, Calendar, RefreshCw, Key } from "lucide-react";
import Modal from "./components/Modal";
import CvToast from "./components/CvToast";

interface Student {
  id: number;
  full_name: string;
  email: string;
  joined_at: string;
  enrolled_courses: string[];
}

const StudentManagement = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Delete Modal State
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  // ✅ NEW: Reset Password State
  const [resetModal, setResetModal] = useState<{ id: number, name: string } | null>(null);
  const [newPass, setNewPass] = useState("");

  // ✅ NEW: Toast State
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
    show: false, message: "", type: "success"
  });

  // ✅ NEW: Toast Helper
  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  // 🎨 THEME
  const brand = {
    blue: "var(--neon-cyan)",
    textMain: "var(--foreground)",
    textLight: "var(--muted-foreground)",
    cardBg: "var(--surface)",
    border: "var(--border)",
    danger: "#ef4444",
    green: "var(--neon-cyan)"
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_BASE_URL}/admin/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(res.data);
    } catch (err) {
      console.error("Failed to load students", err);
      // Mock data for demonstration if backend is empty
      setStudents([
        { id: 1, full_name: "Demo Student", email: "demo@college.edu", joined_at: "2023-12-01", enrolled_courses: ["Python Mastery", "Java Basics"] }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!studentToDelete) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_BASE_URL}/admin/students/${studentToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(students.filter(s => s.id !== studentToDelete.id));
      setStudentToDelete(null);

      triggerToast("Student removed successfully.", "success");
    } catch (err) {
      triggerToast("Failed to remove student.", "error");
    }
  };

  // ✅ NEW: Handle Password Reset
  const handleResetPassword = async () => {
    if (!resetModal || !newPass) return;
    try {
      const token = localStorage.getItem("token");
      await axios.patch(`${API_BASE_URL}/admin/students/${resetModal.id}/reset-password`,
        { new_password: newPass },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      triggerToast("Password reset successfully!", "success");
      setResetModal(null);
      setNewPass("");
    } catch (err) {
      triggerToast("Failed to reset password.", "error");
    }
  };

  const filteredStudents = students.filter(s =>
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto", position: "relative" }}>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "800", color: brand.textMain, margin: 0 }}>Student Management</h1>
          <p style={{ color: brand.textLight, marginTop: "5px" }}>Manage enrollments and remove users.</p>
        </div>

        {/* Search Bar */}
        <div style={{ position: "relative", width: "100%", maxWidth: "300px" }}>
          <Search size={18} style={{ position: "absolute", left: "12px", top: "12px", color: brand.textLight }} />
          <input
            type="text"
            placeholder="Search students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="cv-input !pl-10"
            style={{
              width: "100%", padding: "10px 10px 10px 40px", borderRadius: "10px",
              border: `1px solid ${brand.border}`, outline: "none", fontSize: "14px"
            }}
          />
        </div>
      </div>

      {/* TABLE CARD */}
      <div style={{ background: brand.cardBg, borderRadius: "16px", border: `1px solid ${brand.border}`, overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "800px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${brand.border}`, color: brand.textLight, fontSize: "12px", textTransform: "uppercase" }}>
                <th style={{ padding: "20px", fontWeight: "700" }}>Student Name</th>
                <th style={{ padding: "20px", fontWeight: "700" }}>Joined Date</th>
                {/* ✅ NEW: Password Column Header */}
                <th style={{ padding: "20px", fontWeight: "700" }}>Password</th>
                <th style={{ padding: "20px", fontWeight: "700" }}>Enrolled Courses</th>
                <th style={{ padding: "20px", fontWeight: "700", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: brand.textLight }}>Loading data...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: brand.textLight }}>No students found.</td></tr>
              ) : (
                filteredStudents.map(student => (
                  <tr key={student.id} className="cv-table-row">
                    <td style={{ padding: "20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "color-mix(in oklab, var(--neon-cyan) 16%, var(--input))", color: brand.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <User size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: "700", color: brand.textMain }}>{student.full_name}</div>
                          <div style={{ fontSize: "12px", color: brand.textLight }}>{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "20px", color: brand.textLight, fontSize: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Calendar size={14} /> {student.joined_at || "N/A"}
                      </div>
                    </td>

                    {/* ✅ NEW: Password Reset Cell */}
                    <td style={{ padding: "20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ color: brand.textLight, fontSize: "18px", letterSpacing: "2px", lineHeight: "0" }}>••••••</span>
                        <button
                          onClick={() => setResetModal({ id: student.id, name: student.full_name })}
                          style={{ padding: "6px", background: "var(--input)", color: brand.blue, border: `1px solid ${brand.border}`, borderRadius: "6px", cursor: "pointer" }}
                          title="Reset Password"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </td>

                    <td style={{ padding: "20px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {student.enrolled_courses.length > 0 ? student.enrolled_courses.map((c, i) => (
                          <span key={i} style={{ fontSize: "11px", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", color: brand.textMain, border: `1px solid ${brand.border}` }}>
                            {c}
                          </span>
                        )) : <span style={{ fontSize: "12px", color: brand.textLight, fontStyle: "italic" }}>Not enrolled</span>}
                      </div>
                    </td>
                    <td style={{ padding: "20px", textAlign: "right" }}>
                      <button
                        onClick={() => setStudentToDelete(student)}
                        style={{ padding: "8px", background: "#fef2f2", color: brand.danger, border: "1px solid #fee2e2", borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}
                        title="Remove Student"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

          </table>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      <Modal open={!!studentToDelete} onClose={() => setStudentToDelete(null)}>
            {studentToDelete && (
            <div style={{ background: "white", padding: "30px", borderRadius: "16px", width: "400px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ width: "50px", height: "50px", background: "#fef2f2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px auto" }}>
                <AlertCircle size={28} color={brand.danger} />
              </div>
              <h3 style={{ margin: "0 0 10px 0", color: brand.textMain, fontSize: "20px", fontWeight: "800" }}>Remove Student?</h3>
              <p style={{ color: brand.textLight, fontSize: "14px", marginBottom: "24px", lineHeight: "1.5" }}>
                Are you sure you want to remove <strong>{studentToDelete.full_name}</strong>? This action cannot be undone.
              </p>
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setStudentToDelete(null)} style={{ flex: 1, padding: "12px", background: "white", border: `1px solid ${brand.border}`, borderRadius: "8px", fontWeight: "700", color: brand.textLight, cursor: "pointer" }}>Cancel</button>
                <button onClick={handleDelete} style={{ flex: 1, padding: "12px", background: brand.danger, border: "none", borderRadius: "8px", fontWeight: "700", color: "white", cursor: "pointer" }}>Yes, Remove</button>
              </div>
            </div>
            )}
      </Modal>

      <Modal open={!!resetModal} onClose={() => { setResetModal(null); setNewPass(""); }}>
            {resetModal && (
            <div style={{ background: "white", padding: "30px", borderRadius: "16px", width: "400px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ width: "50px", height: "50px", background: "#f0f9ff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px auto" }}>
                <Key size={24} color={brand.blue} />
              </div>
              <h3 style={{ margin: "0 0 10px 0", color: brand.textMain, fontSize: "20px", fontWeight: "800" }}>Reset Password</h3>
              <p style={{ color: brand.textLight, fontSize: "14px", marginBottom: "20px" }}>
                Set a new password for <strong>{resetModal.name}</strong>.
              </p>

              <input
                type="text"
                className="cv-input mb-5"
                placeholder="Enter new password..."
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => { setResetModal(null); setNewPass(""); }} style={{ flex: 1, padding: "12px", background: "white", border: `1px solid ${brand.border}`, borderRadius: "8px", fontWeight: "700", color: brand.textLight, cursor: "pointer" }}>Cancel</button>
                <button onClick={handleResetPassword} disabled={!newPass} style={{ flex: 1, padding: "12px", background: brand.blue, border: "none", borderRadius: "8px", fontWeight: "700", color: "white", cursor: "pointer", opacity: newPass ? 1 : 0.7 }}>Update</button>
              </div>
            </div>
            )}
      </Modal>

      <CvToast
        show={toast.show}
        type={toast.type}
        message={toast.message}
        successColor={brand.green}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />

    </div >
  );
};

export default StudentManagement;