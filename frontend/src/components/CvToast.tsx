import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle, X } from "lucide-react";

type CvToastProps = {
  show: boolean;
  type: "success" | "error";
  message: string;
  title?: string;
  onClose: () => void;
  successColor?: string;
  children?: ReactNode;
};

export function ToastPortal({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return createPortal(<div className="cv-toast-host">{children}</div>, document.body);
}

export default function CvToast({
  show,
  type,
  message,
  title,
  onClose,
  successColor = "#87C232",
  children,
}: CvToastProps) {
  if (!show) return null;

  const borderColor = type === "success" ? successColor : "#ef4444";
  const resolvedTitle = title ?? (type === "success" ? "Success" : "Error");

  return createPortal(
    <div className="cv-toast" style={{ borderLeftColor: borderColor }}>
      {children ?? (
        <>
          {type === "success" ? (
            <CheckCircle size={24} color={successColor} />
          ) : (
            <AlertCircle size={24} color="#ef4444" />
          )}
          <div>
            <h4 className="cv-toast-title">{resolvedTitle}</h4>
            <p className="cv-toast-message">{message}</p>
          </div>
          <button type="button" onClick={onClose} className="cv-toast-close" aria-label="Dismiss">
            <X size={16} color="#94a3b8" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
