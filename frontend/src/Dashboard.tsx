import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from './config';
import {
  Users, TrendingUp, IndianRupee, BookOpen,
  UserPlus, FileText, MessageSquare, X
} from "lucide-react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const Dashboard = () => {
  // ✅ Initialize with 0 so it animates to the real number
  const [stats, setStats] = useState({
    revenue: 0,
    students: 0,
    courses: 0,
    newEnrollments: 0,
    pendingReviews: 2,
    messages: 8
  });

  const [userRole, setUserRole] = useState("");
  // Live Session States (Student View Only)
  const [activeSession, setActiveSession] = useState<any>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  // Mock Data for Charts (Keep as visual placeholder)
  const activityData = [{ name: 'Mon', students: 12 }, { name: 'Tue', students: 19 }, { name: 'Wed', students: 35 }, { name: 'Thu', students: 28 }, { name: 'Fri', students: 45 }, { name: 'Sat', students: 60 }, { name: 'Sun', students: 55 }];
  const sparkData = [{ val: 10 }, { val: 20 }, { val: 15 }, { val: 30 }, { val: 45 }, { val: 60 }];

  // 🎨 PROFESSIONAL THEME COLORS
  const theme = {
    cardBg: "#F8FAFC",      // Off-White / Very Light Gray
    border: "#cbd5e1",      // Subtle Border
    textMain: "#1e293b",    // Dark Slate
    textLight: "#64748b",   // Muted Slate
    iconColor: "#64748b",   // Neutral Icon Color
    chartLine: "#334155"    // Professional Chart Line Color
  };

  useEffect(() => {
    const fetchStats = async () => {
      const token = localStorage.getItem("token");
      // Determine role roughly from token (or you can store it in localStorage on login)
      const storedRole = localStorage.getItem("role") || "student"; // Defaulting to student if not found
      setUserRole(storedRole);

      try {
        const config = { headers: { Authorization: `Bearer ${token}` } };

        // 1. Fetch Real Courses Count
        const coursesRes = await axios.get(`${API_BASE_URL}/courses`, config);

        // 2. Fetch Real Students Count (Only if instructor)
        let studentCount = 0;
        if (storedRole === "instructor" || storedRole === "admin") {
          try {
            const studentsRes = await axios.get(`${API_BASE_URL}/admin/students`, config); studentCount = studentsRes.data.length;
          } catch (e) { console.log("Not authorized to fetch students"); }
        }

        // 3. Calculate Real Stats
        const courseCount = coursesRes.data.length;
        const revenue = studentCount * 599; // Assuming ₹599 per student

        setStats(prev => ({
          ...prev,
          revenue: revenue,
          students: studentCount,
          courses: courseCount,
          newEnrollments: studentCount
        }));

        // 4. CHECK FOR ACTIVE LIVE SESSION
        const liveRes = await axios.get(`${API_BASE_URL}/live/active`, config);
        if (liveRes.data && liveRes.data.length > 0) {
          setActiveSession(liveRes.data[0]);
        }

      } catch (err) { console.error("Failed to load dashboard stats", err); }
    };
    fetchStats();
  }, []);

  // Extract YouTube ID Helper
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const AnimatedCounter = ({ value, prefix = "" }: { value: number, prefix?: string }) => {
    const [count, setCount] = useState(0);
    useEffect(() => {
      let start = 0; const end = value; if (start === end) return;
      const increment = end / 50;
      const timer = setInterval(() => { start += increment; if (start >= end) { setCount(end); clearInterval(timer); } else setCount(Math.ceil(start)); }, 20);
      return () => clearInterval(timer);
    }, [value]);
    return <span>{prefix}{count}</span>;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8 relative">

      {/* --- STUDENT ONLY: JOIN LIVE CARD --- */}
      {/* ✅ FIX: Only show this banner if role is STUDENT */}
      {activeSession && userRole === "student" && (
        <motion.div
          initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-gradient-to-r from-red-600 to-red-500 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 bg-white rounded-full animate-ping"></span>
              <span className="font-bold uppercase tracking-widest text-xs">Live Class In Progress</span>
            </div>
            <h2 className="text-2xl font-extrabold">{activeSession.topic}</h2>
            <p className="text-red-100 text-sm mt-1">Join the interactive session now.</p>
          </div>
          <button
            onClick={() => setShowPlayerModal(true)}
            className="w-full md:w-auto bg-white text-red-600 px-6 py-3 rounded-xl font-bold hover:bg-red-50 transition-colors shadow-sm"
          >
            Join Live Class
          </button>
        </motion.div>
      )}

      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2">Dashboard Overview</h1>
        <p className="text-slate-500">Track your course performance and student activity.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { title: "New Enrollments", val: stats.newEnrollments, icon: UserPlus },
          { title: "Pending Reviews", val: stats.pendingReviews, icon: FileText },
          { title: "Unread Messages", val: stats.messages, icon: MessageSquare }
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            style={{ background: theme.cardBg, borderColor: theme.border }}
            className="p-5 rounded-2xl border shadow-sm flex items-center gap-5"
          >
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <item.icon size={24} strokeWidth={1.5} color={theme.iconColor} />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-800">
                <AnimatedCounter value={item.val} />
              </div>
              <div className="text-sm text-slate-500 font-medium">{item.title}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Performance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* TOTAL STUDENTS */}
        <div style={{ background: theme.cardBg, borderColor: theme.border }} className="p-6 rounded-2xl border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Total Students</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-1"><AnimatedCounter value={stats.students} /></h2>
            </div>
            <div className="p-2 bg-slate-100 rounded-lg">
              <Users size={24} strokeWidth={1.5} color={theme.iconColor} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-green-600 text-xs font-bold">
            <TrendingUp size={16} strokeWidth={2} /> +12% this month
          </div>
        </div>

        {/* REVENUE */}
        <div style={{ background: theme.cardBg, borderColor: theme.border }} className="p-6 rounded-2xl border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Revenue</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-1"><AnimatedCounter value={stats.revenue} prefix="₹" /></h2>
            </div>
            <div className="p-2 bg-slate-100 rounded-lg">
              <IndianRupee size={24} strokeWidth={1.5} color={theme.iconColor} />
            </div>
          </div>
          <div className="h-10 w-full">
            <ResponsiveContainer>
              <AreaChart data={sparkData}>
                <Area type="monotone" dataKey="val" stroke="#94a3b8" fill="#e2e8f0" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ACTIVE COURSES */}
        <div style={{ background: theme.cardBg, borderColor: theme.border }} className="p-6 rounded-2xl border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Active Courses</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-1"><AnimatedCounter value={stats.courses} /></h2>
            </div>
            <div className="p-2 bg-slate-100 rounded-lg">
              <BookOpen size={24} strokeWidth={1.5} color={theme.iconColor} />
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
            <div className="w-[70%] bg-slate-400 h-full rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div style={{ background: theme.cardBg, borderColor: theme.border }} className="p-6 rounded-2xl border h-[350px]">
        <h3 className="text-base font-bold text-slate-800 mb-5">Student Activity</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={activityData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                background: '#FFFFFF',
                color: '#1e293b'
              }}
            />
            <Line
              type="monotone"
              dataKey="students"
              stroke={theme.chartLine}
              strokeWidth={3}
              dot={{ r: 4, fill: theme.chartLine }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* --- STUDENT MODAL: PLAY LIVE STREAM --- */}
      {showPlayerModal && activeSession && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-black rounded-2xl overflow-hidden relative shadow-2xl border border-slate-800">
            <button onClick={() => setShowPlayerModal(false)} className="absolute top-4 right-4 text-white hover:text-red-500 z-10"><X size={32} /></button>
            <div className="relative pt-[56.25%]">
              <iframe
                className="absolute top-0 left-0 w-full h-full"
                src={`https://www.youtube.com/embed/${getYoutubeId(activeSession.youtube_url)}?autoplay=1`}
                title="Live Class"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
          <h2 className="text-white text-2xl font-bold mt-4">{activeSession.topic}</h2>
        </div>
      )}

    </motion.div>
  );
};

export default Dashboard;