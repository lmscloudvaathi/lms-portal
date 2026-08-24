export default function ThemeBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="blob-violet absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full blur-[120px] animate-float-slow" />
      <div className="blob-cyan absolute top-40 right-0 h-[380px] w-[380px] rounded-full blur-[120px] animate-float-slow [animation-delay:-3s]" />
      <div className="blob-magenta absolute bottom-0 left-1/3 h-[360px] w-[360px] rounded-full blur-[120px] animate-float-slow [animation-delay:-6s]" />
    </div>
  );
}
