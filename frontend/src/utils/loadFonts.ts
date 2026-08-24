const MONO_FONT_ID = "cv-jetbrains-mono-font";
const MONO_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap";

/** Load monospace font only when code editor / terminal UI is shown. */
export function loadJetBrainsMonoFont(): void {
  if (document.getElementById(MONO_FONT_ID)) return;
  const link = document.createElement("link");
  link.id = MONO_FONT_ID;
  link.rel = "stylesheet";
  link.href = MONO_FONT_HREF;
  document.head.appendChild(link);
}
