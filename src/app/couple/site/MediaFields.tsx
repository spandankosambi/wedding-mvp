"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { removeEventPhoto, uploadEventPhoto, uploadMusic } from "./actions";

type Scope = { weddingId: string; admin: boolean; family: "bride" | "groom" };
const base = (s: Scope) => { const fd = new FormData(); if (s.admin) fd.set("weddingId", s.weddingId); fd.set("family", s.family); return fd; };

/** Background music: one MP3 or M4A, up to `maxMb` MB. */
export function MusicUpload({ scope, has, maxMb }: { scope: Scope; has: boolean; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) { setMsg({ ok: false, text: `That file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${maxMb} MB. Trim the track or export it at a lower quality.` }); return; }
    setBusy(true); setMsg(null);
    const fd = base(scope); fd.set("file", file);
    try {
      const r = await uploadMusic(fd);
      setMsg(r.ok ? { ok: true, text: "Music added." } : { ok: false, text: r.error ?? "Couldn't upload that file." });
      if (r.ok) router.refresh();
    } catch { setMsg({ ok: false, text: "Couldn't upload that file. Try again." }); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <label className="portal-button-secondary inline-flex cursor-pointer">
        {busy ? "Uploading…" : has ? "Replace the music" : "Upload music"}
        <input ref={input} type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a" className="sr-only" disabled={busy} aria-label="Upload background music" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </div>
  );
}

async function shrink(file: File, edge = 900): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("couldn't encode");
  return blob;
}

/** A photo for one celebration's medallion (shown when "Medallions" is chosen under Design touches). */
export function EventPhotoField({ scope, eventId, eventName, url, uploadsOn }: { scope: Scope; eventId: string; eventName: string; url: string | null; uploadsOn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const fd = base(scope); fd.set("eventId", eventId);
      fd.set("file", new File([await shrink(file)], "photo.jpg", { type: "image/jpeg" }));
      const r = await uploadEventPhoto(fd);
      if (!r.ok) setErr(r.error ?? "Couldn't upload that photo."); else router.refresh();
    } catch { setErr("Couldn't read this file — try a JPG or PNG."); }
    setBusy(false);
  }
  async function remove() {
    setBusy(true); setErr(null);
    const fd = base(scope); fd.set("eventId", eventId);
    const r = await removeEventPhoto(fd);
    if (!r.ok) setErr(r.error ?? "Couldn't remove it."); else router.refresh();
    setBusy(false);
  }

  return (
    <div className="md:col-span-2">
      <span className="text-xs font-medium text-neutral-600">Photo for its medallion</span>
      <span className="ml-2 text-xs text-neutral-400">optional; used when celebrations are shown as medallions</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {url && <img src={url} alt="" className="h-14 w-11 rounded-[50%] object-cover ring-1 ring-neutral-200" />}
        {uploadsOn ? (
          <label className="portal-button-secondary inline-flex cursor-pointer">
            {busy ? "Working…" : url ? "Change photo" : "Add a photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} aria-label={`Photo for ${eventName}`} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        ) : <span className="text-xs text-neutral-500">Photo uploads aren&apos;t switched on for this site yet.</span>}
        {url && <button type="button" disabled={busy} onClick={remove} className="text-xs text-neutral-500 underline underline-offset-2 hover:text-red-700" aria-label={`Remove the photo for ${eventName}`}>Remove</button>}
      </div>
      {err && <p className="mt-2 text-xs text-red-700" role="alert">{err}</p>}
    </div>
  );
}
