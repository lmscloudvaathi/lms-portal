import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import API_BASE_URL from "./config";
import { Save, IndianRupee, ArrowLeft, Clock, CheckCircle, AlertCircle, X } from "lucide-react";
import { COURSE_CATEGORY_OPTIONS } from "./utils/courseCategories";
import ThumbnailPicker from "./components/ThumbnailPicker";

const CreateCourse = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "", description: "", price: "", image_url: "", duration: "",
    course_type: "standard", language: "python", category: "general"
  });
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [isFree, setIsFree] = useState(false);

  const triggerToast = (message: string, type: "success" | "error") => {
    setToast({ show: true, message, type: type as "success" | "error" });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const token = localStorage.getItem("token");
    const finalDescription = formData.duration ? `${formData.description}\n\n[Duration: ${formData.duration}]` : formData.description;

    const payload = {
      title: formData.title,
      description: finalDescription,
      price: isFree ? 0 : parseInt(formData.price),
      image_url: formData.image_url,
      course_type: formData.course_type,
      language: formData.course_type === "coding" ? formData.language : null,
      category: formData.category,
    };

    try {
      const response = await axios.post(`${API_BASE_URL}/courses`, payload, { headers: { Authorization: `Bearer ${token}` } });
      triggerToast("Course Created Successfully! Redirecting...", "success");
      setTimeout(() => {
        navigate(`/dashboard/course/${response.data.id}/builder`);
      }, 2000);
    } catch (error: any) {
      console.error(error);
      triggerToast("Failed to create course. Please try again.", "error");
    } finally {
      if (!toast.show) setLoading(false);
    }
  };

  const typeBtn = (active: boolean) =>
    `rounded-xl border px-4 py-3 text-left transition-all ${
      active
        ? "border-primary bg-input shadow-[0_0_0_1px_var(--primary)]"
        : "border-border bg-transparent hover:border-primary/50"
    }`;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 animate-fade-in">
      <div className="mb-6 flex flex-col-reverse justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="mb-1 text-2xl font-extrabold md:text-3xl">Create New Course</h2>
          <p className="text-sm text-muted-foreground">Set the details, then jump into the curriculum builder.</p>
        </div>
        <button
          onClick={() => navigate("/dashboard/courses")}
          className="cv-btn-ghost self-start !px-4 !py-2 text-sm md:self-auto"
        >
          <ArrowLeft size={16} strokeWidth={2.5} /> Back to Courses
        </button>
      </div>

      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 glass flex items-center gap-3 rounded-xl border-l-4 p-4 ${toast.type === "success" ? "border-green-500" : "border-red-500"}`}>
          {toast.type === "success" ? <CheckCircle size={22} className="text-green-400" /> : <AlertCircle size={22} className="text-red-400" />}
          <div>
            <h4 className="m-0 text-sm font-bold">{toast.type === "success" ? "Success" : "Error"}</h4>
            <p className="m-0 text-xs text-muted-foreground">{toast.message}</p>
          </div>
          <button onClick={() => setToast({ ...toast, show: false })} className="ml-1 border-none bg-transparent text-muted-foreground"><X size={16} /></button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass rounded-2xl p-4 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <span className="cv-label">Course type</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setFormData({ ...formData, course_type: "standard" })} className={typeBtn(formData.course_type === "standard")}>
                  <div className="text-sm font-bold">Standard Course</div>
                  <div className="mt-1 text-xs text-muted-foreground">Video, PDF, quizzes & assignments</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, course_type: "coding", category: formData.category === "general" ? "programming" : formData.category })}
                  className={typeBtn(formData.course_type === "coding")}
                >
                  <div className="text-sm font-bold">Coding Course</div>
                  <div className="mt-1 text-xs text-muted-foreground">Practice problems with compiler</div>
                </button>
              </div>
            </div>

            {formData.course_type === "coding" && (
              <div>
                <label className="cv-label" htmlFor="course-language">Programming language</label>
                <select
                  id="course-language"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  className="cv-input cv-select"
                >
                  <option value="python">Python (3.8.1)</option>
                  <option value="java">Java (OpenJDK 13)</option>
                  <option value="cpp">C++ (GCC 9.2)</option>
                  <option value="javascript">JavaScript (Node.js)</option>
                </select>
              </div>
            )}

            <div>
              <label className="cv-label" htmlFor="course-title">Course title</label>
              <input
                id="course-title"
                type="text"
                placeholder="e.g. Advanced Java Masterclass"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="cv-input"
              />
            </div>

            <div>
              <label className="cv-label" htmlFor="course-description">Syllabus / description PDF link</label>
              <input
                id="course-description"
                type="text"
                placeholder="Paste Google Drive link to PDF"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                className="cv-input"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="cv-label" htmlFor="course-category">Category</label>
                <select
                  id="course-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="cv-input cv-select"
                >
                  {COURSE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <p className="cv-hint">Students use this on Explore.</p>
              </div>
              <div>
                <label className="cv-label" htmlFor="course-duration">Total duration</label>
                <div className="relative">
                  <Clock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="course-duration"
                    type="text"
                    placeholder="e.g. 12 Hours 30 Mins"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="cv-input !pl-10"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="cv-label" htmlFor="course-price">Price (INR)</label>
              <div className="relative max-w-xs">
                <IndianRupee size={16} className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${isFree ? "opacity-40" : "text-muted-foreground"}`} />
                <input
                  id="course-price"
                  type="number"
                  placeholder="999"
                  value={isFree ? 0 : formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required={!isFree}
                  disabled={isFree}
                  className="cv-input !pl-10"
                />
              </div>
              <label htmlFor="freeCourse" className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  id="freeCourse"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[var(--neon-cyan)]"
                />
                Set as free course
              </label>
            </div>
          </div>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <span className="cv-label">Course thumbnail</span>
            <ThumbnailPicker compact value={formData.image_url} onChange={(image_url) => setFormData({ ...formData, image_url })} />
            <p className="cv-hint">A 16:9 cover image helps the course stand out on the student dashboard.</p>
          </aside>
        </div>

        <div className="mt-6 flex flex-col-reverse justify-end gap-3 border-t border-border pt-4 md:flex-row">
          <button type="button" onClick={() => navigate("/dashboard/courses")} className="cv-btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="cv-btn-primary disabled:cursor-not-allowed disabled:opacity-70">
            <Save size={18} /> {loading ? "Creating..." : "Create & build curriculum"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateCourse;
