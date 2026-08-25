import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  closeOnBackdrop?: boolean;
};

let scrollLockCount = 0;
let savedBodyOverflow = "";

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow || "";
  }
}

/** Force-clear body lock if count gets stuck (e.g. after route change). */
export function forceUnlockBodyScroll() {
  scrollLockCount = 0;
  document.body.style.overflow = "";
  document.body.style.pointerEvents = "";
}

export default function Modal({
  open,
  onClose,
  children,
  overlayClassName = "",
  overlayStyle,
  closeOnBackdrop = true,
}: ModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      if (lockedRef.current) {
        unlockBodyScroll();
        lockedRef.current = false;
      }
      return;
    }

    lockBodyScroll();
    lockedRef.current = true;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (lockedRef.current) {
        unlockBodyScroll();
        lockedRef.current = false;
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={`cv-modal-overlay ${overlayClassName}`.trim()}
      style={overlayStyle}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>,
    document.body,
  );
}
