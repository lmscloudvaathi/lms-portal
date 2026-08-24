import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BookOpen, UserPlus, PlusCircle, LogOut, Bell,
  ChevronRight, Code, Menu, Users, FolderOpen, MessageSquare
} from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import ProfileMenu from "./components/ProfileMenu";
import { clearSession, getValidSession } from "./utils/session";

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const session = getValidSession();
  const storedRole = session?.role || localStorage.getItem("role") || "instructor";
  const storedEmail = session?.email || localStorage.getItem("email") || "";
  const isAdmin = storedRole === "admin";
  const profileUser = {
    name: isAdmin ? "Administrator" : "Instructor",
    email: storedEmail || "Signed in",
  };
  const avatarLabel = isAdmin ? "AD" : "IN";

  const menuItems = [
    { label: "Home", path: "/dashboard", icon: <LayoutDashboard size={20} /> },
    { label: "My Courses", path: "/dashboard/courses", icon: <BookOpen size={20} /> },
    { label: "Create Course", path: "/dashboard/create-course", icon: <PlusCircle size={20} /> },
    { label: "Code Arena", path: "/dashboard/code-arena", icon: <Code size={20} /> },
    { label: "Add Admits", path: "/dashboard/add-admits", icon: <UserPlus size={20} /> },
    { label: "Students", path: "/dashboard/students", icon: <Users size={20} /> },
    { label: "Verification", path: "/dashboard/assignments", icon: <FolderOpen size={20} /> },
    { label: "Messages", path: "/dashboard/messages", icon: <MessageSquare size={20} /> },
  ];

  const handleLogout = () => {
    clearSession();
    navigate("/admin-login");
  };

  return (
    <div className="flex h-screen bg-transparent font-sans">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[var(--z-sidebar)] bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[var(--z-header)] flex flex-col glass border-r border-border/50 shadow-xl transition-all duration-300 lg:static lg:shadow-none
            ${mobileMenuOpen ? "translate-x-0 w-72" : "-translate-x-full lg:translate-x-0"}
            ${collapsed ? "lg:w-20" : "lg:w-72"}
        `}
      >
        <div className={`p-6 border-b border-border flex items-center gap-2 ${collapsed ? "lg:justify-center lg:px-2" : "justify-between"}`}>
          {(!collapsed || mobileMenuOpen) && (
            <div>
              <BrandLogo size="md" />
              <span className="text-[11px] text-primary font-bold uppercase tracking-widest block mt-1">
                {isAdmin ? "Administrator" : "Instructor"}
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-2 rounded-lg text-muted-foreground hover:bg-white/10 transition-colors"
          >
            <Menu size={24} />
          </button>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-2 rounded-lg text-muted-foreground hover:bg-white/10 transition-colors"
          >
            <Menu size={24} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname === item.path + "/";

            return (
              <div
                key={item.path}
                onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                title={collapsed ? item.label : ""}
                className={`flex items-center p-3.5 rounded-xl cursor-pointer transition-all duration-200 group
                    ${collapsed ? "justify-center" : "justify-between"}
                    ${isActive ? "bg-input text-primary shadow-sm font-bold" : "text-muted-foreground hover:bg-white/5 hover:text-foreground font-medium"}
                `}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-110"}`}>{item.icon}</div>
                  {(!collapsed || mobileMenuOpen) && <span className="text-[15px]">{item.label}</span>}
                </div>
                {(!collapsed || mobileMenuOpen) && isActive && <ChevronRight size={16} className="text-primary" strokeWidth={3} />}
              </div>
            );
          })}
        </nav>

        <div className="p-5 border-t border-border">
          <div
            onClick={handleLogout}
            className={`flex items-center gap-3 p-3 text-muted-foreground cursor-pointer font-semibold rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400
                ${collapsed ? "justify-center" : "justify-start"}
            `}
          >
            <LogOut size={20} strokeWidth={2} /> {(!collapsed || mobileMenuOpen) && <span>Sign Out</span>}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full min-h-0 w-full">
        <header className="relative z-[var(--z-header)] h-20 shrink-0 glass border-b border-border/50 flex items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 -ml-2 text-muted-foreground">
              <Menu size={24} />
            </button>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">
              {menuItems.find(i => i.path === location.pathname)?.label || "Dashboard"}
            </h1>
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            <button className="p-2 rounded-full hover:bg-white/10 transition-colors relative">
              <Bell size={22} className="text-muted-foreground" strokeWidth={2} />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-background"></span>
            </button>

            <ProfileMenu
              name={profileUser.name}
              email={profileUser.email}
              onSettings={() => navigate("/dashboard/settings")}
              onSignOut={handleLogout}
            >
              {avatarLabel}
            </ProfileMenu>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-10 overflow-y-auto overflow-x-hidden bg-transparent">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
