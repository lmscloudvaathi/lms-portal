import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import axios from "axios";
import { FileText, PlusCircle, BookOpen, Trash2, X, Pencil, Image as ImageIcon } from "lucide-react";
import API_BASE_URL, { GOOGLE_CLIENT_ID, resolveMediaUrl } from './config';
import AdminLogin from "./AdminLogin";
import Login from "./Login";
import DashboardLayout from "./DashboardLayout";
import CreateCourse from "./CreateCourse";
import CourseBuilder from "./CourseBuilder";
import AssignmentManager from "./AssignmentManager";
import StudentDashboard from "./StudentDashboard"; 
import CoursePlayer from "./CoursePlayer"; 
import CourseProgressDashboard from "./CourseProgressDashboard"; 
import VerifyCertificate from "./VerifyCertificate";
import AddAdmits from "./AddAdmits"; 
import CoursePreview from "./CoursePreview";
import CodeArena from "./CodeArena"; 
import Dashboard from "./Dashboard"; 
import InstructorSettings from "./InstructorSettings"; 
import StudentManagement from "./StudentManagement";
import Messages from "./Messages";
import CodingCourseManager from "./CodingCourseManager";
import { clearSession, getValidSession } from "./utils/session";
import ThemeBackdrop from "./components/ThemeBackdrop";
import ThumbnailPicker from "./components/ThumbnailPicker";
import Modal, { forceUnlockBodyScroll } from "./components/Modal";
import CvToast from "./components/CvToast";
import { COURSE_CATEGORY_OPTIONS } from "./utils/courseCategories";

function RouteInteractionCleanup() {
  const location = useLocation();
  useEffect(() => {
    forceUnlockBodyScroll();
    try {
      (window as Window & { google?: { accounts?: { id?: { cancel?: () => void } } } }).google?.accounts?.id?.cancel?.();
    } catch {
      /* ignore */
    }
  }, [location.pathname]);
  return null;
}

type AdminCourse = {
  id: number;
  title: string;
  description?: string;
  price?: number;
  image_url?: string | null;
  language?: string | null;
  category?: string | null;
  is_published?: boolean;
  course_type?: string;
};

// --- Modified CourseList Component ---
const CourseList = () => {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AdminCourse | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    price: 0,
    image_url: "",
    language: "",
    category: "general",
  });
  const navigate = useNavigate();

  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({ 
    show: false, message: "", type: "success" 
  });

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  const fetchCourses = async () => {
    const session = getValidSession();
    if (!session?.token) { setLoading(false); return; }
    try {
      const res = await axios.get(`${API_BASE_URL}/courses`, { headers: { Authorization: `Bearer ${session.token}` } });
      setCourses(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      if (err.response?.status === 401) { clearSession(); window.location.href = "/"; }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const openEditCourse = (e: React.MouseEvent, course: AdminCourse) => {
    e.stopPropagation();
    setEditingCourse(course);
    setEditForm({
      title: course.title || "",
      description: course.description || "",
      price: Number(course.price) || 0,
      image_url: course.image_url || "",
      language: course.language || "",
      category: course.category || "general",
    });
  };

  const handleSaveCourse = async () => {
    if (!editingCourse) return;
    if (!editForm.title.trim()) {
      triggerToast("Course title is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.patch(
        `${API_BASE_URL}/courses/${editingCourse.id}/details`,
        {
          title: editForm.title.trim(),
          description: editForm.description,
          price: Number(editForm.price) || 0,
          image_url: editForm.image_url || "",
          language: editForm.language || "",
          category: editForm.category || "general",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = res.data?.course || {};
      setCourses((prev) =>
        prev.map((c) =>
          c.id === editingCourse.id
            ? {
                ...c,
                ...editForm,
                image_url: updated.image_url ?? editForm.image_url,
                is_published: updated.is_published ?? c.is_published,
              }
            : c
        )
      );
      triggerToast(
        editingCourse.is_published
          ? "Published course updated (including thumbnail)."
          : "Course updated successfully.",
        "success"
      );
      setEditingCourse(null);
    } catch (err: any) {
      triggerToast(err?.response?.data?.detail || "Failed to update course.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async (e: React.MouseEvent, courseId: number) => {
    e.stopPropagation(); 
    
    if (!window.confirm("Are you sure you want to delete this course? This cannot be undone.")) return;

    try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API_BASE_URL}/courses/${courseId}`, {
         headers: { Authorization: `Bearer ${token}` }
        });
        
        setCourses(courses.filter((c) => c.id !== courseId));
        triggerToast("Course deleted successfully!", "success");
    } catch (err) {
        triggerToast("Failed to delete course. Ensure no students are enrolled.", "error");
    }
  };

  if (loading) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;
  
  return (
    <div style={{ animation: "fadeIn 0.5s ease", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div>
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: "var(--foreground)", margin: 0 }}>{localStorage.getItem("role") === "admin" ? "All Courses" : "My Courses"}</h2>
            <p style={{ color: "var(--muted-foreground)", margin: "4px 0 0 0" }}>{localStorage.getItem("role") === "admin" ? "View and manage every course on the platform." : "Manage your curriculum. Edit drafts and published courses anytime."}</p>
        </div>
        <button onClick={() => navigate("/dashboard/create-course")} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--gradient-neon)", color: "var(--primary-foreground)", padding: "12px 20px", borderRadius: "999px", border: "none", fontWeight: "600", cursor: "pointer" }}><PlusCircle size={18} /> Create New Course</button>
      </div>
      
      {courses.length === 0 ? ( 
        <div style={{ textAlign: "center", padding: "80px", background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)" }}>
            <BookOpen size={48} color="#cbd5e1" style={{ marginBottom: "16px" }} />
            <h3 style={{ color: "var(--foreground)", margin: "0 0 8px 0" }}>No courses found</h3>
        </div> 
      ) : ( 
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}>
            {courses.map((course) => (
                <div key={course.id} style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden", cursor: "pointer", transition: "transform 0.2s", position: "relative" }} onClick={() => navigate(`/dashboard/course/${course.id}/builder`)}>
                    <div style={{ height: "160px", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                        {course.image_url ? <img src={resolveMediaUrl(course.image_url)} alt={course.title} style={{width:"100%", height:"100%", objectFit:"cover"}} /> : <FileText size={48} color="#cbd5e1" />}
                        <span style={{
                          position: "absolute", top: 12, left: 12,
                          background: course.is_published ? "#87C232" : "#64748b",
                          color: "white", fontSize: 11, fontWeight: 700, padding: "4px 10px",
                          borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.04em"
                        }}>
                          {course.is_published ? "Published" : "Draft"}
                        </span>
                    </div>
                    
                    <div style={{ padding: "20px" }}>
                        <h4 style={{ margin: "0 0 14px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.title}</h4>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            onClick={(e) => openEditCourse(e, course)}
                            style={{
                              flex: 1, background: "color-mix(in oklab, var(--neon-cyan) 14%, var(--surface))", border: "1px solid var(--border)", borderRadius: 8,
                              padding: "8px 12px", cursor: "pointer", color: "var(--neon-cyan)",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                              fontWeight: 700, fontSize: 13
                            }}
                            title="Edit course details & thumbnail"
                          >
                            <Pencil size={15} /> Edit
                          </button>
                          <button
                            onClick={(e) => openEditCourse(e, course)}
                            style={{
                              background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8,
                              padding: 8, cursor: "pointer", color: "var(--muted-foreground)",
                              display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                            title="Change thumbnail"
                          >
                            <ImageIcon size={16} />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteCourse(e, course.id)}
                            style={{ 
                                background: "color-mix(in oklab, #ef4444 16%, var(--surface))", border: "1px solid color-mix(in oklab, #ef4444 35%, transparent)", borderRadius: "8px", 
                                padding: "8px", cursor: "pointer", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                            title="Delete Course"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                    </div>
                </div>
            ))}
        </div> 
      )}

      <Modal open={!!editingCourse} onClose={() => !saving && setEditingCourse(null)} closeOnBackdrop={!saving}>
          {editingCourse && (
          <div className="cv-modal max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="cv-modal-header flex items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-lg font-extrabold">Edit course</h3>
                <p className="cv-hint">
                  {editingCourse.is_published ? "Published — details and thumbnail can still be updated." : "Draft course"}
                </p>
              </div>
              <button type="button" onClick={() => setEditingCourse(null)} disabled={saving} className="rounded-lg p-2 text-muted-foreground hover:bg-white/10">
                <X size={20} />
              </button>
            </div>

            <div className="cv-modal-body">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex min-w-0 flex-col gap-4">
                  <div>
                    <label className="cv-label" htmlFor="edit-title">Title</label>
                    <input
                      id="edit-title"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="cv-input"
                      placeholder="Course title"
                    />
                  </div>
                  <div>
                    <label className="cv-label" htmlFor="edit-description">Description</label>
                    <textarea
                      id="edit-description"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                      className="cv-input min-h-[72px] resize-y"
                      placeholder="Short course summary or syllabus link"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="cv-label" htmlFor="edit-price">Price</label>
                      <input
                        id="edit-price"
                        type="number"
                        min={0}
                        value={editForm.price}
                        onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) || 0 })}
                        className="cv-input"
                      />
                    </div>
                    <div>
                      <label className="cv-label" htmlFor="edit-language">Language</label>
                      <input
                        id="edit-language"
                        value={editForm.language}
                        onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                        placeholder="e.g. English, Tamil"
                        className="cv-input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="cv-label" htmlFor="edit-category">Category</label>
                    <select
                      id="edit-category"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="cv-input cv-select"
                    >
                      {COURSE_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <span className="cv-label">Course thumbnail</span>
                  <ThumbnailPicker
                    compact
                    value={editForm.image_url}
                    onChange={(image_url) => setEditForm({ ...editForm, image_url })}
                  />
                </div>
              </div>
            </div>

            <div className="cv-modal-footer">
              <button type="button" onClick={() => setEditingCourse(null)} disabled={saving} className="cv-btn-ghost flex-1 !rounded-xl">
                Cancel
              </button>
              <button type="button" onClick={handleSaveCourse} disabled={saving} className="cv-btn-primary flex-1 !rounded-xl disabled:opacity-70">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
          )}
      </Modal>

      <CvToast
        show={toast.show}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
};

function App() {
  const routes = (
    <Router>
      <RouteInteractionCleanup />
      <ThemeBackdrop />
      <Routes>
        <Route path="/" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/certificates/:credentialId" element={<VerifyCertificate />} />
        <Route path="/admin-login" element={<PublicOnlyRoute><AdminLogin /></PublicOnlyRoute>} />

        <Route path="/dashboard" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} /> 
          <Route path="courses" element={<CourseList />} />
          <Route path="create-course" element={<CreateCourse />} />
          <Route path="course/:courseId/builder" element={<CourseBuilder />} />
          <Route path="assignments" element={<AssignmentManager />} />
          <Route path="add-admits" element={<AddAdmits />} />
          <Route path="course/:courseId/preview" element={<CodingCourseManager />} />
          <Route path="course/:courseId/CoursePreview" element={<CoursePreview />} />
          <Route path="code-arena" element={<CodeArena />} />
          <Route path="students" element={<StudentManagement />} />
          <Route path="settings" element={<InstructorSettings />} />
          <Route path="messages" element={<Messages />} />
        </Route>
        
        <Route path="/student-dashboard" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
        <Route path="/course/:courseId" element={<ProtectedRoute requiredRole="student"><CourseProgressDashboard /></ProtectedRoute>} />
        <Route path="/course/:courseId/player" element={<ProtectedRoute requiredRole="student"><CoursePlayer /></ProtectedRoute>} />
        <Route path="*" element={<FallbackRoute />} />
      </Routes>
    </Router>
  );

  if (GOOGLE_CLIENT_ID) {
    return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{routes}</GoogleOAuthProvider>;
  }
  return routes;
}

const isStaffRole = (role: string) => role === "instructor" || role === "admin";

const ProtectedRoute = ({ children, requiredRole }: { children: any, requiredRole?: string }) => {
  const session = getValidSession();
  if (!session?.token) return <Navigate to="/" replace />;
  if (!isStaffRole(session.role) && session.role !== "student") {
    clearSession();
    return <Navigate to="/" replace />;
  }
  if (requiredRole && requiredRole === "instructor" && !isStaffRole(session.role)) {
    return <Navigate to="/student-dashboard" replace />;
  }
  if (requiredRole && requiredRole === "student" && session.role !== "student") {
    return isStaffRole(session.role) ? <Navigate to="/dashboard" replace /> : <Navigate to="/" replace />;
  }
  return children;
};

const PublicOnlyRoute = ({ children }: { children: any }) => {
  const session = getValidSession();
  if (!session?.token) return children;
  if (!isStaffRole(session.role) && session.role !== "student") {
    clearSession();
    return children;
  }
  return session.role === "student" ? <Navigate to="/student-dashboard" replace /> : <Navigate to="/dashboard" replace />;
};

const FallbackRoute = () => {
  const session = getValidSession();
  if (!session?.token) return <Navigate to="/" replace />;
  if (!isStaffRole(session.role) && session.role !== "student") {
    clearSession();
    return <Navigate to="/" replace />;
  }
  return session.role === "student" ? <Navigate to="/student-dashboard" replace /> : <Navigate to="/dashboard" replace />;
};

export default App;