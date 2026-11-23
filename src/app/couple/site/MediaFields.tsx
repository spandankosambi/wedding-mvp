"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMusicAction } from "./actions";

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
      const r = await uploadMusicAction(fd);
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
