import { Link, useLocation } from "react-router-dom";
import BrandLogo from "./BrandLogo";

const LOCAL_NAV = {
  home: "/",
  events: "/",
  testimonials: "/",
};

type SiteHeaderProps = {
  current?: "home" | "events" | "lms" | "testimonials";
  rightSlot?: React.ReactNode;
};

export default function SiteHeader({ current = "lms", rightSlot }: SiteHeaderProps) {
  const location = useLocation();
  const lmsActive = current === "lms" || location.pathname.startsWith("/");

  const linkClass = (active: boolean) =>
    `rounded-md px-2.5 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
      active ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <header className="sticky top-0 z-40 glass border-b border-border/50">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to={LOCAL_NAV.home} className="flex items-center gap-2.5 group shrink-0">
          <BrandLogo size="sm" imageOnly className="!flex-row" />
          <div className="flex flex-col leading-none">
            <span className="font-display font-bold tracking-tight text-base text-foreground">Cloud Vaathi</span>
            <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground text-[10px]">
              Learn - Certify - Transform
            </span>
          </div>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-x-auto sm:gap-1" aria-label="Main">
          <Link to={LOCAL_NAV.home} className={linkClass(current === "home")}>
            Home
          </Link>
          <Link to={LOCAL_NAV.events} className={linkClass(current === "events")}>
            Events
          </Link>
          <Link to="/" className={linkClass(lmsActive && current === "lms")}>
            LMS
          </Link>
          <Link to={LOCAL_NAV.testimonials} className={linkClass(current === "testimonials")}>
            Testimonials
          </Link>
          {rightSlot}
        </nav>
      </div>
    </header>
  );
}
