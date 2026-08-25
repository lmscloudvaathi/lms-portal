import { useEffect, useRef } from "react";

type EdgeSwipeOptions = {
  enabled: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Pixels from the left edge that start an open gesture. */
  edgeWidth?: number;
  /** Minimum horizontal travel to count as a swipe. */
  threshold?: number;
};

/**
 * Mobile edge-swipe: swipe right from the left edge to open a drawer,
 * swipe left on the open drawer to close it.
 */
export function useEdgeSwipe({
  enabled,
  open,
  onOpen,
  onClose,
  edgeWidth = 28,
  threshold = 56,
}: EdgeSwipeOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const mode = useRef<"open" | "close" | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      tracking.current = false;
      mode.current = null;

      if (!open && touch.clientX <= edgeWidth) {
        tracking.current = true;
        mode.current = "open";
      } else if (open) {
        tracking.current = true;
        mode.current = "close";
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      // Prefer horizontal gestures; abandon if clearly scrolling vertically.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 24) {
        tracking.current = false;
        mode.current = null;
        return;
      }

      if (mode.current === "open" && dx > threshold) {
        tracking.current = false;
        mode.current = null;
        onOpen();
      } else if (mode.current === "close" && dx < -threshold) {
        tracking.current = false;
        mode.current = null;
        onClose();
      }
    };

    const onTouchEnd = () => {
      tracking.current = false;
      mode.current = null;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, open, onOpen, onClose, edgeWidth, threshold]);
}
