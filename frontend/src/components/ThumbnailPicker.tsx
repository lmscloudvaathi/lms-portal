import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Image as ImageIcon, Upload, X, ZoomIn, Move, Check } from "lucide-react";
import API_BASE_URL, { resolveMediaUrl } from "../config";

const ASPECT = 16 / 9;
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;

type ThumbnailPickerProps = {
  value: string;
  onChange: (url: string) => void;
  compact?: boolean;
};

async function uploadThumbnail(blob: Blob): Promise<string> {
  const token = localStorage.getItem("token");
  const form = new FormData();
  form.append("file", blob, "thumbnail.jpg");
  const res = await axios.post(`${API_BASE_URL}/uploads/thumbnail`, form, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return String(res.data?.url || "");
}

function exportCrop(
  img: HTMLImageElement,
  panX: number,
  panY: number,
  zoom: number,
  viewW: number,
  viewH: number,
): Promise<Blob> {
  const cover = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
  const displayW = img.naturalWidth * cover * zoom;
  const displayH = img.naturalHeight * cover * zoom;
  const sx = ((displayW - viewW) / 2 - panX) / displayW * img.naturalWidth;
  const sy = ((displayH - viewH) / 2 - panY) / displayH * img.naturalHeight;
  const sw = viewW / displayW * img.naturalWidth;
  const sh = viewH / displayH * img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not crop image"));
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export image"))), "image/jpeg", 0.86);
  });
}

const ThumbnailPicker = ({ value, onChange, compact = false }: ThumbnailPickerProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draggingFile, setDraggingFile] = useState(false);

  useEffect(() => {
    return () => {
      if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    };
  }, [source]);

  const openFile = () => fileRef.current?.click();

  const onFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a photo file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Photo must be 8MB or smaller.");
      return;
    }
    setError("");
    if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setEditing(true);
  };

  const applyCrop = async () => {
    const img = imgRef.current;
    const view = viewRef.current;
    if (!img || !view) return;
    setSaving(true);
    setError("");
    try {
      const blob = await exportCrop(img, pan.x, pan.y, zoom, view.clientWidth, view.clientHeight);
      try {
        onChange(await uploadThumbnail(blob));
      } catch {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Could not read image"));
          reader.readAsDataURL(blob);
        });
        onChange(dataUrl);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save thumbnail.");
    } finally {
      setSaving(false);
    }
  };

  const viewW = viewRef.current?.clientWidth || (compact ? 360 : 520);
  const viewH = viewW / ASPECT;
  const cover = nat.w && nat.h ? Math.max(viewW / nat.w, viewH / nat.h) : 1;
  const displayW = nat.w * cover * zoom;
  const displayH = nat.h * cover * zoom;
  const preview = resolveMediaUrl(value);

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {preview ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-input">
          <div className={`relative w-full overflow-hidden bg-slate-900 ${compact ? "aspect-video max-h-36" : "aspect-video"}`}>
            <img src={preview} alt="Course thumbnail" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            <button type="button" onClick={openFile} className="cv-btn-primary !rounded-xl !px-4 !py-2 text-xs">
              <Upload size={14} /> Change photo
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="cv-btn-ghost !rounded-xl !px-4 !py-2 text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openFile}
          onDragOver={(e) => {
            e.preventDefault();
            setDraggingFile(true);
          }}
          onDragLeave={() => setDraggingFile(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDraggingFile(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
          className={`cv-dropzone ${compact ? "!min-h-[132px] !p-4" : ""} ${draggingFile ? "is-dragging" : ""}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-neon text-primary-foreground">
            {draggingFile ? <ImageIcon size={20} /> : <Upload size={20} />}
          </span>
          <span className="text-sm font-bold">Upload course thumbnail</span>
          <span className="text-[11px] font-medium text-muted-foreground">
            Click or drop a photo · PNG, JPG, WEBP · 16:9
          </span>
        </button>
      )}
      {error && !editing && <p className="mt-2 text-xs font-bold text-red-400">{error}</p>}

      {editing && (
        <div className="cv-modal-overlay z-[1200]" onClick={() => !saving && setEditing(false)}>
          <div className="cv-modal max-w-[560px]" onClick={(e) => e.stopPropagation()}>
            <div className="cv-modal-header flex items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-lg font-extrabold">Adjust thumbnail</h3>
                <p className="cv-hint mt-1 flex items-center gap-1">
                  <Move size={12} /> Drag to reposition, then zoom to crop
                </p>
              </div>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <div className="cv-modal-body">
              <div
                ref={viewRef}
                className="relative mx-auto w-full cursor-grab select-none overflow-hidden rounded-xl bg-slate-900 active:cursor-grabbing"
                style={{ aspectRatio: `${ASPECT}` }}
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                  setDrag({ x: e.clientX - pan.x, y: e.clientY - pan.y });
                }}
                onPointerMove={(e) => {
                  if (!drag) return;
                  setPan({ x: e.clientX - drag.x, y: e.clientY - drag.y });
                }}
                onPointerUp={() => setDrag(null)}
              >
                {source && (
                  <img
                    ref={imgRef}
                    src={source}
                    alt="Adjust"
                    draggable={false}
                    onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    className="pointer-events-none absolute max-w-none"
                    style={{
                      width: displayW || "100%",
                      height: displayH || "auto",
                      left: (viewW - displayW) / 2 + pan.x,
                      top: (viewH - displayH) / 2 + pan.y,
                    }}
                  />
                )}
                <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-white/80" />
              </div>

              <label className="mt-4 flex items-center gap-3 text-sm font-bold">
                <ZoomIn size={16} /> Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-[var(--neon-cyan)]"
                />
              </label>
              {error && <p className="mt-3 text-xs font-bold text-red-400">{error}</p>}
            </div>

            <div className="cv-modal-footer">
              <button type="button" onClick={() => setEditing(false)} className="cv-btn-ghost flex-1 !rounded-xl">
                Cancel
              </button>
              <button type="button" onClick={applyCrop} disabled={saving} className="cv-btn-primary flex-1 !rounded-xl disabled:opacity-70">
                <Check size={16} /> {saving ? "Saving..." : "Use this photo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThumbnailPicker;
