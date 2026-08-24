import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from './config';
import { 
  ChevronDown, ChevronRight, CheckCircle, ExternalLink, 
   User, FileText, FolderOpen, AlertTriangle, X 
} from "lucide-react";

const AssignmentVerification = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState<number | null>(null);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);

  // ✅ NEW: Toast State
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({ 
    show: false, message: "", type: "success" 
  });

  // ✅ NEW: Toast Helper
  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_BASE_URL}/instructor/assignments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const verifyAssignment = async (submissionId: number) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API_BASE_URL}/instructor/verify-assignment/${submissionId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh local state to show "Verified"
      fetchData();
      
      // ✅ REPLACED ALERT WITH TOAST
      triggerToast("Assignment Verified Successfully!", "success");
    } catch (err) {
      // ✅ REPLACED ALERT WITH TOAST
      triggerToast("Error verifying assignment", "error");
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading dashboard...</div>;

  return (
    <div className="relative font-sans">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <FolderOpen className="text-primary" /> Assignment Verification
      </h1>

      <div className="space-y-4">
        {data.map((course) => (
          <div key={course.course_id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            
            {/* LEVEL 1: COURSE HEADER */}
            <div 
              onClick={() => setExpandedCourse(expandedCourse === course.course_id ? null : course.course_id)}
              className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div>
                <h2 className="font-bold text-lg text-slate-800">{course.course_title}</h2>
                <p className="text-sm text-slate-500">{course.assignment_tasks.length} Assignment Tasks</p>
              </div>
              {expandedCourse === course.course_id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </div>

            {/* LEVEL 2: ASSIGNMENT TASKS */}
            {expandedCourse === course.course_id && (
              <div className="bg-slate-50 p-4 space-y-3 border-t border-slate-100">
                {course.assignment_tasks.map((task: any) => (
                  <div key={task.task_id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    
                    <div 
                      onClick={() => setExpandedTask(expandedTask === task.task_id ? null : task.task_id)}
                      className="p-4 flex justify-between items-center cursor-pointer hover:bg-blue-50/50"
                    >
                      <div className="flex items-center gap-3">
                         <div className="bg-blue-100 text-[#005EB8] p-2 rounded-lg">
                            <FileText size={18} />
                         </div>
                         <span className="font-semibold text-slate-700">{task.task_title}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded">
                           {task.submitted.length} Submitted
                        </span>
                        <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-1 rounded">
                           {task.pending.length} Pending
                        </span>
                        {expandedTask === task.task_id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </div>

                    {/* LEVEL 3: STUDENT SUBMISSIONS & PENDING LIST */}
                    {expandedTask === task.task_id && (
                      <div className="p-4 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        {/* COLUMN 1: SUBMITTED (Verification Area) */}
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Submitted for Review</h4>
                          {task.submitted.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No submissions yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {task.submitted.map((sub: any) => (
                                <div key={sub.submission_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                  <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">
                                        {sub.student_name.charAt(0)}
                                     </div>
                                     <div>
                                        <p className="text-sm font-bold text-slate-800">{sub.student_name}</p>
                                        <p className="text-[10px] text-slate-500">Sent: {sub.submitted_at}</p>
                                     </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    {/* 🔗 THE MAGIC LINK */}
                                    <a 
                                      href={sub.drive_search_link} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="p-2 text-slate-500 hover:text-[#005EB8] hover:bg-white rounded border border-transparent hover:border-slate-200 transition-all"
                                      title="Open Assignment in Drive"
                                    >
                                       <ExternalLink size={16} />
                                    </a>

                                    {/* ✅ VERIFY BUTTON */}
                                    {sub.status === "Verified" ? (
                                        <span className="text-green-600 font-bold text-xs flex items-center gap-1 bg-green-100 px-2 py-1 rounded">
                                            <CheckCircle size={12} /> Verified
                                        </span>
                                    ) : (
                                        <button 
                                          onClick={() => verifyAssignment(sub.submission_id)}
                                          className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-[#005EB8] transition-colors"
                                        >
                                          Mark Complete
                                        </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* COLUMN 2: PENDING STUDENTS */}
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Pending Submissions</h4>
                          {task.pending.length === 0 ? (
                            <p className="text-sm text-green-500 italic">Everyone has submitted!</p>
                          ) : (
                            <div className="space-y-2">
                              {task.pending.map((student: any) => (
                                <div key={student.student_id} className="flex items-center gap-3 p-2 rounded-lg opacity-70">
                                   <div className="w-6 h-6 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center">
                                      <User size={12} />
                                   </div>
                                   <span className="text-sm text-slate-600">{student.student_name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    )}

                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ✅ NEW: TOAST COMPONENT */}
      {toast.show && (
        <div style={{ 
            position: "fixed", top: "20px", right: "20px", 
            background: "white", padding: "16px 24px", borderRadius: "12px", 
            boxShadow: "0 10px 30px -5px rgba(0,0,0,0.15)", 
            borderLeft: `6px solid ${toast.type === "success" ? "#87C232" : "#ef4444"}`,
            display: "flex", alignItems: "center", gap: "12px", zIndex: 9999,
            animation: "slideIn 0.3s ease-out"
        }}>
            {toast.type === "success" ? <CheckCircle size={24} color="#87C232" /> : <AlertTriangle size={24} color="#ef4444" />}
            <div>
                <h4 style={{ margin: "0", fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>
                    {toast.type === "success" ? "Success" : "Error"}
                </h4>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{toast.message}</p>
            </div>
            <button onClick={() => setToast(prev => ({ ...prev, show: false }))} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "10px", color: "#94a3b8" }}>
                <X size={16} />
            </button>
        </div>
      )}
    </div>
  );
};

export default AssignmentVerification;