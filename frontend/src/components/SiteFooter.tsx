import { Link } from "react-router-dom";

const LOCAL_NAV = {
  home: "/",
  events: "/",
  testimonials: "/",
};

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/50 bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <img src="/CloudVaathiLogo.png" alt="Cloud Vaathi logo" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            <div className="flex flex-col leading-none">
              <span className="font-display font-bold tracking-tight text-sm">Cloud Vaathi</span>
              <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground text-[9px]">
                Learn - Certify - Transform
              </span>
            </div>
          </div>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            A community-led academy for cloud, DevOps and platform engineers. Live cohorts, real projects and a network that ships.
          </p>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Explore</h4>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link className="hover:text-primary" to={LOCAL_NAV.home}>Home</Link></li>
            <li><Link className="hover:text-primary" to={LOCAL_NAV.events}>Courses &amp; events</Link></li>
            <li><Link className="hover:text-primary" to="/">LMS</Link></li>
            <li><Link className="hover:text-primary" to={LOCAL_NAV.testimonials}>Testimonials</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Contact</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="mailto:lmscloudvaathi@gmail.com" className="hover:text-primary">
                lmscloudvaathi@gmail.com
              </a>
            </li>
            <li>Chennai · Bengaluru</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/40 px-4 py-5 text-center text-xs text-muted-foreground">
        © 2026 Cloud Vaathi. Built for the cloud generation.
      </div>
    </footer>
  );
}
