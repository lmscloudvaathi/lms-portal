import { useEffect, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  closeOnBackdrop?: boolean;
};

export default function Modal({
  open,
  onClose,
  children,
  overlayClassName = "",
  overlayStyle,
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`cv-modal-overlay ${overlayClassName}`.trim()}
      style={overlayStyle}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      {children}
    </div>,
    document.body,
  );
}
