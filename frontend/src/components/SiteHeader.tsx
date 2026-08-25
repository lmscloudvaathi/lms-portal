import { Link, useLocation } from "react-router-dom";
import BrandLogo from "./BrandLogo";

/** Marketing site lives outside this LMS SPA. */
const MARKETING_ORIGIN = "https://cloudvaathi.in";

const NAV = {
  home: `${MARKETING_ORIGIN}/`,
  events: `${MARKETING_ORIGIN}/#events`,
  testimonials: `${MARKETING_ORIGIN}/#testimonials`,
  lms: "/",
} as const;

type SiteHeaderProps = {
  current?: "home" | "events" | "lms" | "testimonials";
  rightSlot?: React.ReactNode;
};

function ExternalNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const className = `rounded-md px-2.5 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
    active ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:text-foreground"
  }`;
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export default function SiteHeader({ current = "lms", rightSlot }: SiteHeaderProps) {
  const location = useLocation();
  const onLms = current === "lms" || location.pathname === "/" || location.pathname.startsWith("/admin-login");

  return (
    <header className="sticky top-0 z-40 glass border-b border-border/50">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href={NAV.home} className="flex items-center gap-2.5 group shrink-0">
          <BrandLogo size="sm" imageOnly className="!flex-row" />
          <div className="flex flex-col leading-none">
            <span className="font-display font-bold tracking-tight text-base text-foreground">Cloud Vaathi</span>
            <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground text-[10px]">
              Learn - Certify - Transform
            </span>
          </div>
        </a>
        <nav className="flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-x-auto sm:gap-1" aria-label="Main">
          <ExternalNavLink href={NAV.home} active={current === "home"}>
            Home
          </ExternalNavLink>
          <ExternalNavLink href={NAV.events} active={current === "events"}>
            Events
          </ExternalNavLink>
          <Link
            to={NAV.lms}
            className={`rounded-md px-2.5 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
              onLms && current === "lms"
                ? "text-foreground bg-secondary/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            LMS
          </Link>
          <ExternalNavLink href={NAV.testimonials} active={current === "testimonials"}>
            Testimonials
          </ExternalNavLink>
          {rightSlot}
        </nav>
      </div>
    </header>
  );
}
