"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadGalleryPhoto } from "./actions";

const LONG_EDGE = 2000;

/** Phone photos are 3–10 MB; shrink to a 2000px JPEG (~300–600 KB) in the
    browser so uploads are quick on mobile data and fit the server's limits. */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("couldn't encode");
  return { blob, width, height };
}

export function GalleryUploader({ weddingId, admin, remaining }: { weddingId: string; admin: boolean; remaining: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, remaining);
    const skipped = files.length - list.length;
    setBusy(true); setProblems([]);
    const errs: string[] = [];
    let done = 0;
    for (const f of list) {
      setStatus(`Uploading ${done + 1} of ${list.length}…`);
      try {
        const { blob, width, height } = await shrink(f);
        const fd = new FormData();
        if (admin) fd.set("weddingId", weddingId);
        fd.set("photo", new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
        fd.set("width", String(width));
        fd.set("height", String(height));
        const r = await uploadGalleryPhoto(fd);
        if (r.ok) done++;
        else errs.push(`${f.name}: ${r.error}`);
      } catch {
        errs.push(`${f.name}: couldn't read this file — try a JPG or PNG`);
      }
    }
    if (skipped > 0) errs.push(`${skipped} photo${skipped === 1 ? "" : "s"} not added — the gallery is full`);
    setProblems(errs);
    setStatus(done ? `${done} photo${done === 1 ? "" : "s"} added.` : null);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (done) router.refresh();
  }

  return (
    <div>
      <label className={`portal-button-secondary inline-flex cursor-pointer items-center gap-2 ${busy || remaining <= 0 ? "pointer-events-none opacity-50" : ""}`}>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="sr-only"
          disabled={busy || remaining <= 0}
          onChange={(e) => upload(e.target.files)}
          aria-label="Add photos to the gallery"
        />
        {busy ? "Uploading…" : "+ Add photos"}
      </label>
      <p className="mt-2 text-xs text-neutral-500" aria-live="polite">
        {status ?? (remaining > 0 ? `Pick several at once. Room for ${remaining} more.` : "The gallery is full — remove one to add another.")}
      </p>
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-700" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
}
