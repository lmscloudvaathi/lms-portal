import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd"; import API_BASE_URL from './config';
import {
  ArrowLeft, Trash2, Edit2, Video, FileText,
  Code, HelpCircle, FileQuestion, ChevronDown, ChevronRight,
  CheckCircle, X, AlertTriangle, GripVertical, Radio, Zap,
  Check
} from "lucide-react";

// --- Types ---
interface ContentItem {
  id: number;
  title: string;
  type: string;
  url: string;
  order: number;
  resource_links?: { title: string; link: string }[];
}
interface Module {
  id: number;
  title: string;
  lessons: ContentItem[]; // Note: API returns 'lessons', we use it here
}

const CoursePreview = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [modules, setModules] = useState<Module[]>([]); // Local state for Drag & Drop
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState<number[]>([]);

  // Editing Item State
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editResourceLinks, setEditResourceLinks] = useState<{ title: string; link: string }[]>([{ title: "", link: "" }]);

  // Editing Module State
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");

  // Delete Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<{ id: number; type: 'item' | 'module' } | null>(null);

  // Toast State
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
    show: false, message: "", type: "success"
  });

  // 🎨 PROFESSIONAL THEME
  const brand = {
    blue: "#005EB8",
    green: "#87C232",
    textMain: "#1e293b",
    textLight: "#64748b",
    cardBg: "#F8FAFC",
    border: "#cbd5e1"
  };

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  useEffect(() => { fetchCourseData(); }, [courseId]);

  const fetchCourseData = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_BASE_URL}/courses/${courseId}/player`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourse(res.data);

      // Initialize modules state for DnD, sorting items by order
      const sortedModules = res.data.modules.map((m: any) => ({
        ...m,
        lessons: m.lessons.sort((a: any, b: any) => a.order - b.order)
      }));
      setModules(sortedModules);

      // Auto-expand all modules initially
      setExpandedModules(res.data.modules.map((m: any) => m.id));
    } catch (err) { console.error("Error loading preview", err); } finally { setLoading(false); }
  };

  // --- ITEM ACTIONS ---
  const handleDeleteItem = async (itemId: number) => {
    if (deleteConfirmId?.id !== itemId || deleteConfirmId?.type !== 'item') {
      setDeleteConfirmId({ id: itemId, type: 'item' });
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_BASE_URL}/content/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });

      // Update local state instead of refetching for speed
      const updatedModules = modules.map(m => ({
        ...m,
        lessons: m.lessons.filter(l => l.id !== itemId)
      }));
      setModules(updatedModules);

      setDeleteConfirmId(null);
      triggerToast("Item deleted successfully", "success");
    } catch (err) { triggerToast("Failed to delete item.", "error"); }
  };

  const getResourceLinksForEdit = (item: any): { title: string; link: string }[] => {
    const links = Array.isArray(item?.resource_links) ? item.resource_links : [];
    const normalized = links
      .map((resource: any) => ({
        title: String(resource?.title || "").trim(),
        link: String(resource?.link || "").trim(),
      }))
      .filter((resource: { title: string; link: string }) => resource.title && resource.link);
    return normalized.length ? normalized : [{ title: "", link: "" }];
  };

  const handleEditItemStart = (item: any) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditUrl(item.url);
    setEditResourceLinks(getResourceLinksForEdit(item));
  };

  const updateEditResourceLink = (index: number, field: "title" | "link", value: string) => {
    setEditResourceLinks(prev => prev.map((resource, idx) => (idx === index ? { ...resource, [field]: value } : resource)));
  };

  const addEditResourceLink = () => {
    setEditResourceLinks(prev => [...prev, { title: "", link: "" }]);
  };

  const removeEditResourceLink = (index: number) => {
    setEditResourceLinks(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length ? next : [{ title: "", link: "" }];
    });
  };

  const handleEditItemSave = async () => {
    if (!editingItem) return;
    try {
      const token = localStorage.getItem("token");
      const payload: any = { title: editTitle, url: editUrl };
      if (editingItem.type === "video") {
        payload.resource_links = editResourceLinks
          .map(resource => ({ title: resource.title.trim(), link: resource.link.trim() }))
          .filter(resource => resource.title && resource.link);
      }
      await axios.patch(`${API_BASE_URL}/content/${editingItem.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });

      // Update local state
      const updatedModules = modules.map(m => ({
        ...m,
        lessons: m.lessons.map(l => l.id === editingItem.id
          ? {
            ...l,
            title: editTitle,
            url: editUrl,
            resource_links: editingItem.type === "video"
              ? editResourceLinks
                .map(resource => ({ title: resource.title.trim(), link: resource.link.trim() }))
                .filter(resource => resource.title && resource.link)
              : l.resource_links
          }
          : l)
      }));
      setModules(updatedModules);

      setEditingItem(null);
      triggerToast("Item updated successfully", "success");
    } catch (err) { triggerToast("Failed to update item.", "error"); }
  };

  // --- MODULE ACTIONS (NEW) ---
  const handleEditModuleStart = (module: any, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggling accordion
    setEditingModuleId(module.id);
    setEditModuleTitle(module.title);
  };

  const handleEditModuleSave = async () => {
    if (!editingModuleId) return;
    try {
      const token = localStorage.getItem("token");
      await axios.patch(`${API_BASE_URL}/modules/${editingModuleId}`, { title: editModuleTitle }, { headers: { Authorization: `Bearer ${token}` } });

      setModules(modules.map(m => m.id === editingModuleId ? { ...m, title: editModuleTitle } : m));
      setEditingModuleId(null);
      triggerToast("Module renamed!", "success");
    } catch (err) { triggerToast("Failed to rename module", "error"); }
  };

  const handleDeleteModule = async (moduleId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirmId?.id !== moduleId || deleteConfirmId?.type !== 'module') {
      setDeleteConfirmId({ id: moduleId, type: 'module' });
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_BASE_URL}/modules/${moduleId}`, { headers: { Authorization: `Bearer ${token}` } });
      setModules(modules.filter(m => m.id !== moduleId));
      setDeleteConfirmId(null);
      triggerToast("Module and its content deleted.", "success");
    } catch (err) { triggerToast("Failed to delete module", "error"); }
  };


  // --- DRAG AND DROP LOGIC ---
  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, type } = result;

    if (source.droppableId !== destination.droppableId) return;

    // --- MODULE REORDERING ---
    if (type === "module") {
      const newModules = Array.from(modules);
      const [reorderedModule] = newModules.splice(source.index, 1);
      newModules.splice(destination.index, 0, reorderedModule);

      setModules(newModules);

      try {
        const token = localStorage.getItem("token");
        await axios.put(`${API_BASE_URL}/courses/${courseId}/modules/reorder`,
          { module_ids: newModules.map(m => m.id) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (e) {
        triggerToast("Failed to save module order", "error");
      }
      return;
    }

    // --- LESSON REORDERING ---
    if (type === "lesson") {
      // Parse module ID from droppableId "module-lessons-{id}"
      const moduleId = parseInt(source.droppableId.replace("module-lessons-", ""));
      const moduleIndex = modules.findIndex(m => m.id === moduleId);

      if (moduleIndex === -1) return;

      const newLessons = Array.from(modules[moduleIndex].lessons);
      const [reorderedItem] = newLessons.splice(source.index, 1);
      newLessons.splice(destination.index, 0, reorderedItem);

      const newModules = [...modules];
      newModules[moduleIndex].lessons = newLessons;
      setModules(newModules);

      try {
        const token = localStorage.getItem("token");
        const itemIds = newLessons.map(i => i.id);
        await axios.put(
          `${API_BASE_URL}/modules/${moduleId}/reorder`,
          { item_ids: itemIds },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err) {
        triggerToast("Failed to save new order", "error");
      }
    }
  };

  const toggleModule = (id: number) => { setExpandedModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]); };

  const getIcon = (type: string) => {
    switch (type) {
      case "video": return <Video size={18} color="#005EB8" />;
      case "note": return <FileText size={18} color="#E67E22" />;
      case "quiz": return <HelpCircle size={18} color="#87C232" />;
      case "code_test": return <Code size={18} color="#9B59B6" />;
      case "live_test": return <Zap size={18} color="#F59E0B" />;
      case "live_class": return <Radio size={18} color="#EF4444" />;
      default: return <FileQuestion size={18} color="#64748b" />;
    }
  };

  const getNormalizedResourceLinks = (lesson: any): { title: string; link: string }[] => {
    const raw = Array.isArray(lesson?.resource_links) ? lesson.resource_links : [];
    return raw
      .map((resource: any) => ({
        title: String(resource?.title || resource?.link || "").trim(),
        link: String(resource?.link || resource?.url || "").trim(),
      }))
      .filter((resource: { title: string; link: string }) => resource.title && resource.link);
  };

  if (loading) return <div style={{ padding: "40px", color: brand.textLight }}>Loading content...</div>;
  if (!course) return <div style={{ padding: "40px", color: brand.textLight }}>Course not found.</div>;

  return (
    <div className="p-5 md:p-10 max-w-5xl mx-auto relative min-h-screen bg-[#F8FAFC]">
      {/* HEADER */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/dashboard/course/${courseId}/builder`)}
            className="bg-white border border-slate-300 rounded-full p-2.5 text-slate-700 hover:bg-slate-50 transition-all hover:shadow-md cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col">
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#0f172a] tracking-tight">{course.title}</h1>
            <p className="text-slate-500 text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Content Manager & Preview
            </p>
          </div>
        </div>
        <div className="bg-[#e0f2fe] text-[#005EB8] px-4 py-1.5 rounded-full font-bold text-xs tracking-wider uppercase border border-blue-200 shadow-sm self-start md:self-auto">
          Instructor View
        </div>
      </div>

      {/* MODULES LIST WITH DRAG AND DROP */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="course-modules" type="module">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex flex-col gap-5"
            >
              {modules.map((module, index) => (
                <Draggable key={module.id} draggableId={`module-${module.id}`} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow ${snapshot.isDragging ? "ring-2 ring-blue-500 shadow-lg" : ""}`}
                    >

                      {/* Module Header (With Drag Handle & Edit/Delete) */}
                      <div
                        onClick={() => toggleModule(module.id)}
                        className={`p-4 md:p-5 cursor-pointer flex items-center justify-between transition-colors ${expandedModules.includes(module.id) ? "bg-slate-50 border-b border-slate-200" : "bg-white hover:bg-slate-50"}`}
                      >
                        <div className="flex items-center gap-3 md:gap-4 flex-1 overflow-hidden">

                          {/* ✋ DRAG HANDLE FOR MODULE */}
                          <div {...provided.dragHandleProps} className="cursor-grab text-slate-400 hover:text-slate-600">
                            <GripVertical size={20} />
                          </div>

                          {editingModuleId === module.id ? (
                            <div onClick={e => e.stopPropagation()} className="flex items-center gap-2 flex-1 max-w-md">
                              <input
                                value={editModuleTitle}
                                onChange={e => setEditModuleTitle(e.target.value)}
                                className="flex-1 p-2 rounded-lg border border-[#005EB8] outline-none text-sm font-bold shadow-sm"
                                autoFocus
                              />
                              <button onClick={handleEditModuleSave} className="bg-[#87C232] border-none rounded-lg p-2 text-white hover:bg-[#76a928] transition-colors"><Check size={16} /></button>
                              <button onClick={() => setEditingModuleId(null)} className="bg-red-500 border-none rounded-lg p-2 text-white hover:bg-red-600 transition-colors"><X size={16} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 overflow-hidden">
                              <h3 className="text-base md:text-lg font-bold text-[#1e293b] truncate">{module.title}</h3>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => handleEditModuleStart(module, e)}
                                  className="px-2 py-1 text-xs font-bold text-[#005EB8] border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                >
                                  Rename
                                </button>
                                <button
                                  onClick={(e) => handleDeleteModule(module.id, e)}
                                  className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${deleteConfirmId?.id === module.id && deleteConfirmId.type === 'module' ? "text-red-600 bg-red-50 font-bold text-xs" : "text-slate-400 hover:text-red-500 hover:bg-red-50"}`}
                                >
                                  {deleteConfirmId?.id === module.id && deleteConfirmId.type === 'module' ? "Confirm?" : <Trash2 size={14} />}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        {expandedModules.includes(module.id) ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                      </div>

                      {/* Lessons List (Draggable) */}
                      {expandedModules.includes(module.id) && (
                        <Droppable droppableId={`module-lessons-${module.id}`} type="lesson">
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              style={{ padding: "10px" }}
                            >
                              {module.lessons.length === 0 ? (
                                <div style={{ padding: "20px", textAlign: "center", color: brand.textLight, fontSize: "14px", fontStyle: "italic" }}>No content yet. Drag items here later.</div>
                              ) : (
                                module.lessons.map((lesson, index) => (
                                  <Draggable key={lesson.id} draggableId={`lesson-${lesson.id}`} index={index}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`flex items-center justify-between p-3 md:p-4 border-b border-slate-100 last:border-none rounded-lg mb-2 transition-all ${snapshot.isDragging ? "bg-blue-50 shadow-md ring-2 ring-blue-200" : "bg-white hover:bg-slate-50"}`}
                                        style={provided.draggableProps.style}
                                      >
                                        {(() => {
                                          const resourceLinks = getNormalizedResourceLinks(lesson);
                                          return (
                                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                                          {/* Drag Handle */}
                                          <div {...provided.dragHandleProps} className="cursor-grab text-slate-300 hover:text-slate-500 transition-colors">
                                            <GripVertical size={20} />
                                          </div>

                                          <div className="w-10 h-10 min-w-[40px] bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
                                            {getIcon(lesson.type)}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm md:text-base text-[#1e293b] truncate pr-2">{lesson.title}</div>
                                            <div className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                                              <span className="uppercase font-bold text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{lesson.type}</span>
                                              <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                              <span className="truncate">{lesson.url || "No Link"}</span>
                                            </div>
                                            {lesson.type === "video" && resourceLinks.length > 0 && (
                                              <div className="mt-2 space-y-1">
                                                {resourceLinks.map((resource, resourceIdx) => (
                                                  <div key={`${lesson.id}-resource-${resourceIdx}`} className="text-[11px] text-slate-600">
                                                    <span className="font-semibold">{resource.title}</span>:{" "}
                                                    <a
                                                      href={resource.link}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="text-[#005EB8] hover:underline break-all"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      {resource.link}
                                                    </a>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                          );
                                        })()}

                                        <div className="flex items-center gap-2">
                                          <button onClick={() => handleEditItemStart(lesson)} className="p-2 border border-slate-200 rounded-lg bg-white text-slate-400 hover:text-[#005EB8] hover:border-[#005EB8] hover:bg-blue-50 transition-all shadow-sm" title="Edit Details">
                                            <Edit2 size={16} />
                                          </button>

                                          <button
                                            onClick={() => handleDeleteItem(lesson.id)}
                                            className={`p-2 border rounded-lg transition-all shadow-sm flex items-center gap-1 ${deleteConfirmId?.id === lesson.id && deleteConfirmId.type === 'item' ? "bg-red-600 border-red-600 text-white px-3" : "bg-white border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200"}`}
                                            title="Delete Item"
                                          >
                                            {deleteConfirmId?.id === lesson.id && deleteConfirmId.type === 'item' ? <span className="text-xs font-bold whitespace-nowrap">Confirm?</span> : <Trash2 size={16} />}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                ))
                              )}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* EDIT ITEM MODAL */}
      {editingItem && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)" }}>
          <div style={{ background: brand.cardBg, padding: "30px", borderRadius: "16px", width: "560px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 style={{ marginTop: 0, color: brand.textMain, fontWeight: "800", fontSize: "18px" }}>Edit Content</h3>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "5px", color: brand.textLight, textTransform: "uppercase" }}>Title</label>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${brand.border}`, outline: "none", color: brand.textMain }} />
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "5px", color: brand.textLight, textTransform: "uppercase" }}>URL / Content Link</label>
              <input value={editUrl} onChange={e => setEditUrl(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${brand.border}`, outline: "none", color: brand.textMain }} />
            </div>
            {editingItem.type === "video" && (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "8px", color: brand.textLight, textTransform: "uppercase" }}>
                  Resource Links (Optional)
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {editResourceLinks.map((resource, index) => (
                    <div key={index} style={{ display: "flex", gap: "8px" }}>
                      <input
                        value={resource.title}
                        onChange={(e) => updateEditResourceLink(index, "title", e.target.value)}
                        placeholder="Resource title"
                        style={{ flex: 1, padding: "10px", borderRadius: "8px", border: `1px solid ${brand.border}`, outline: "none", color: brand.textMain }}
                      />
                      <input
                        value={resource.link}
                        onChange={(e) => updateEditResourceLink(index, "link", e.target.value)}
                        placeholder="https://resource-link..."
                        style={{ flex: 1, padding: "10px", borderRadius: "8px", border: `1px solid ${brand.border}`, outline: "none", color: brand.textMain }}
                      />
                      {editResourceLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEditResourceLink(index)}
                          style={{ border: "none", background: "#fee2e2", color: "#dc2626", borderRadius: "8px", padding: "0 10px", cursor: "pointer", fontWeight: 700 }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addEditResourceLink}
                  style={{ marginTop: "10px", border: "none", background: "none", color: brand.blue, fontWeight: 700, cursor: "pointer" }}
                >
                  + Add Another Resource Link
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleEditItemSave} style={{ flex: 1, padding: "10px", background: brand.blue, color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>Save Changes</button>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: "10px", background: "white", color: brand.textLight, border: `1px solid ${brand.border}`, borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast.show && (
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 9999,
          background: "white", padding: "16px 24px", borderRadius: "12px",
          boxShadow: "0 10px 30px -5px rgba(0,0,0,0.15)", borderLeft: `6px solid ${toast.type === "success" ? brand.green : "#ef4444"}`,
          display: "flex", alignItems: "center", gap: "12px", animation: "slideIn 0.3s ease-out"
        }}>
          {toast.type === "success" ? <CheckCircle size={24} color={brand.green} /> : <AlertTriangle size={24} color="#ef4444" />}
          <div>
            <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "700", color: brand.textMain }}>{toast.type === "success" ? "Success" : "Error"}</h4>
            <p style={{ margin: 0, fontSize: "13px", color: brand.textLight }}>{toast.message}</p>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "10px" }}>
            <X size={16} color="#94a3b8" />
          </button>
          <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
        </div>
      )}
    </div>
  );
};

export default CoursePreview;