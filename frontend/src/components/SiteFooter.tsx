const MARKETING_ORIGIN = "https://cloudvaathi.in";

const NAV = {
  home: `${MARKETING_ORIGIN}/`,
  events: `${MARKETING_ORIGIN}/#events`,
  testimonials: `${MARKETING_ORIGIN}/#testimonials`,
  lms: "/",
} as const;

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
            <li><a className="hover:text-primary" href={NAV.home}>Home</a></li>
            <li><a className="hover:text-primary" href={NAV.events}>Courses &amp; events</a></li>
            <li><a className="hover:text-primary" href={NAV.lms}>LMS</a></li>
            <li><a className="hover:text-primary" href={NAV.testimonials}>Testimonials</a></li>
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
