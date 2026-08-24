// src/Messages.tsx
import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from './config';
import { Send, Users, BookOpen, User } from "lucide-react";

// define basic types to satisfy TypeScript
interface Course {
  id: number;
  title: string;
}

interface Student {
  id: number;
  full_name: string;
  email: string;
}

const Messages = () => {
    const [targetType, setTargetType] = useState("all"); // all, course, student
    const [targetId, setTargetId] = useState("");
    const [message, setMessage] = useState("");
    const [courses, setCourses] = useState<Course[]>([]);
    const [students, setStudents] = useState<Student[]>([]);

    useEffect(() => {
        const token = localStorage.getItem("token");
        axios.get(`${API_BASE_URL}/courses`, { headers: { Authorization: `Bearer ${token}` } }).then(res => setCourses(res.data));
        axios.get(`${API_BASE_URL}/admin/students`, { headers: { Authorization: `Bearer ${token}` } }).then(res => setStudents(res.data));
    }, []);

    const handleSend = async () => {
        if(!message) return alert("Please type a message");
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/notifications/send`, {
                target_type: targetType,
                target_id: targetId ? parseInt(targetId) : null,
                message
            }, { headers: { Authorization: `Bearer ${token}` } });
            alert("Message Sent!");
            setMessage("");
        } catch(err) { alert("Failed to send"); }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Broadcast Messages</h1>
            
        <div className="glass rounded-2xl border border-border p-6 space-y-6">
                {/* 1. Select Audience */}
                <div>
                    <label className="cv-label">To whom?</label>
                    <div className="flex flex-wrap gap-3">
                        <button onClick={() => setTargetType("all")} className={`cv-choice ${targetType === "all" ? "is-active" : ""}`}><Users size={18}/> All Students</button>
                        <button onClick={() => setTargetType("course")} className={`cv-choice ${targetType === "course" ? "is-active" : ""}`}><BookOpen size={18}/> Specific Course</button>
                        <button onClick={() => setTargetType("student")} className={`cv-choice ${targetType === "student" ? "is-active" : ""}`}><User size={18}/> Specific Student</button>
                    </div>
                </div>

                {/* 2. Select Target (Conditional) */}
                {targetType === "course" && (
                    <select className="cv-input cv-select" onChange={(e) => setTargetId(e.target.value)}>
                        <option value="">Select Course...</option>
                        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                )}
                {targetType === "student" && (
                    <select className="cv-input cv-select" onChange={(e) => setTargetId(e.target.value)}>
                        <option value="">Select Student...</option>
                        {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
                    </select>
                )}

                {/* 3. Message */}
                <div>
                    <label className="cv-label">Message</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="cv-input min-h-[120px] resize-y" placeholder="Type your announcement here..."></textarea>
                </div>

                <button onClick={handleSend} className="cv-btn-primary"><Send size={18} /> Send Notification</button>
            </div>
        </div>
    );
};
export default Messages;