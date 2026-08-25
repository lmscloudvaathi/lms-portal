import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BookOpen, UserPlus, PlusCircle, LogOut, Bell,
  ChevronRight, Code, Menu, Users, FolderOpen, MessageSquare, X
} from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import ProfileMenu from "./components/ProfileMenu";
import { forceUnlockBodyScroll } from "./components/Modal";
import { clearSession, getValidSession } from "./utils/session";
import { useEdgeSwipe } from "./hooks/useEdgeSwipe";

/** Clears leftover modal scroll-locks / GIS prompts that can block clicks after navigation. */
function unlockShellInteraction() {
  forceUnlockBodyScroll();
  try {
    (window as Window & { google?: { accounts?: { id?: { cancel?: () => void } } } }).google?.accounts?.id?.cancel?.();
  } catch {
    /* ignore */
  }
}

type BoundaryProps = { children: ReactNode; resetKey: string };
type BoundaryState = { error: Error | null };

class OutletErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <h2 className="mb-2 text-lg font-bold text-foreground">This page hit an error</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {this.state.error.message || "Something went wrong rendering this section."}
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            Use the sidebar to open another section, or retry this page.
          </p>
          <button
            type="button"
            className="cv-btn-primary !rounded-xl"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    { label: "Home", path: "/dashboard", icon: <LayoutDashboard size={20} />, end: true },
    { label: "My Courses", path: "/dashboard/courses", icon: <BookOpen size={20} /> },
    { label: "Create Course", path: "/dashboard/create-course", icon: <PlusCircle size={20} /> },
    { label: "Code Arena", path: "/dashboard/code-arena", icon: <Code size={20} /> },
    { label: "Add Admits", path: "/dashboard/add-admits", icon: <UserPlus size={20} /> },
    { label: "Students", path: "/dashboard/students", icon: <Users size={20} /> },
    { label: "Verification", path: "/dashboard/assignments", icon: <FolderOpen size={20} /> },
    { label: "Messages", path: "/dashboard/messages", icon: <MessageSquare size={20} /> },
  ];

  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  useEdgeSwipe({
    enabled: true,
    open: mobileMenuOpen,
    onOpen: openMobileMenu,
    onClose: closeMobileMenu,
  });

  useEffect(() => {
    unlockShellInteraction();
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    clearSession();
    unlockShellInteraction();
    navigate("/admin-login");
  };

  const activeLabel =
    menuItems.find((item) =>
      item.end
        ? location.pathname === item.path || location.pathname === `${item.path}/`
        : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    )?.label || "Dashboard";

  const showLabels = !collapsed || mobileMenuOpen;

  return (
    <div className="relative flex h-screen bg-transparent font-sans">
      {/* Mobile: thin swipe hint on the left edge */}
      {!mobileMenuOpen && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-1/2 z-30 hidden h-24 w-1.5 -translate-y-1/2 rounded-r-full bg-primary/40 sm:block lg:hidden"
        />
      )}

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,86vw)] flex-col glass border-r border-border/50 shadow-xl transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-72 lg:shadow-none
            ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            ${collapsed ? "lg:w-20" : "lg:w-72"}
        `}
        aria-label="Dashboard sections"
      >
        <div className={`flex items-center gap-2 border-b border-border p-5 ${collapsed && !mobileMenuOpen ? "lg:justify-center lg:px-2" : "justify-between"}`}>
          {showLabels && (
            <div className="min-w-0">
              <BrandLogo size="md" />
              <span className="mt-1 block text-[11px] font-bold uppercase tracking-widest text-primary">
                {isAdmin ? "Administrator" : "Instructor"}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/10 lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={22} />
          </button>
          <button
            type="button"
            onClick={closeMobileMenu}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/10 lg:hidden"
            aria-label="Close sections"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3" aria-label="Sections">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={!!item.end}
              title={item.label}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                `group flex items-center rounded-xl p-3.5 transition-all duration-200
                ${collapsed && !mobileMenuOpen ? "justify-center lg:justify-center" : "justify-between"}
                ${isActive
                  ? "bg-input font-bold text-primary shadow-sm"
                  : "font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground"}`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className={`shrink-0 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-110"}`}>
                      {item.icon}
                    </div>
                    {/* Always show names on mobile drawer; respect collapse only on desktop */}
                    <span className={`truncate text-[15px] ${collapsed && !mobileMenuOpen ? "lg:hidden" : ""}`}>
                      {item.label}
                    </span>
                  </div>
                  {isActive && (
                    <ChevronRight
                      size={16}
                      className={`shrink-0 text-primary ${collapsed && !mobileMenuOpen ? "lg:hidden" : ""}`}
                      strokeWidth={3}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={handleLogout}
            className={`flex w-full items-center gap-3 rounded-lg p-3 font-semibold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400
                ${collapsed && !mobileMenuOpen ? "justify-center" : "justify-start"}
            `}
          >
            <LogOut size={20} strokeWidth={2} />
            <span className={collapsed && !mobileMenuOpen ? "lg:hidden" : ""}>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="relative z-0 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-16 shrink-0 items-center justify-between border-b border-border/50 px-4 glass sm:h-20 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={openMobileMenu}
              className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-white/10 lg:hidden"
              aria-label="Open sections"
            >
              <Menu size={24} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-foreground sm:text-xl lg:text-2xl">{activeLabel}</h1>
              <p className="text-[11px] font-medium text-muted-foreground lg:hidden">
                Menu · swipe from left edge
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4 lg:gap-6">
            <button type="button" className="relative rounded-full p-2 transition-colors hover:bg-white/10">
              <Bell size={22} className="text-muted-foreground" strokeWidth={2} />
              <span className="absolute right-2.5 top-2 h-2 w-2 rounded-full border border-background bg-red-500" />
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

        <div className="relative z-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent p-4 lg:p-10">
          <OutletErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </OutletErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
