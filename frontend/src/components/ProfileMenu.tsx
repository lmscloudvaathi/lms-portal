import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LogOut, Settings } from "lucide-react";

type ProfileMenuProps = {
  name: string;
  email: string;
  onSettings: () => void;
  onSignOut: () => void;
  settingsLabel?: string;
  signOutLabel?: string;
  children: ReactNode;
};

export default function ProfileMenu({
  name,
  email,
  onSettings,
  onSignOut,
  settingsLabel = "Settings",
  signOutLabel = "Sign Out",
  children,
}: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 16 });

  const placeMenu = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  };

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
        onClick={() => setOpen((value) => !value)}
        className="w-10 h-10 rounded-full bg-[#005EB8] text-white flex items-center justify-center font-bold text-base shadow-lg shadow-blue-200/50 hover:scale-105 transition-transform"
      >
        {children}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, right: pos.right, zIndex: "var(--z-popover)" }}
            className="fixed w-64 rounded-xl border border-border bg-card p-4 shadow-2xl"
          >
            <div className="mb-4 border-b border-border pb-4">
              <p className="font-bold text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground mt-1 break-all">{email}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
              className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-muted text-foreground text-sm font-medium transition-colors text-left"
            >
              <Settings size={18} /> {settingsLabel}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-red-500/10 text-red-400 text-sm font-bold transition-colors text-left mt-1"
            >
              <LogOut size={18} /> {signOutLabel}
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
