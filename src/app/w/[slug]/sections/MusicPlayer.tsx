"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The family's background music. Browsers only allow sound after a tap, so it
 * starts when a guest opens the invitation (the opening screen's seal) or
 * taps this button; one more tap mutes it. Their choice is kept for the visit.
 */
export function MusicPlayer({ url, name, raised = false }: { url: string; name: string; raised?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const start = () => {
      let muted = false;
      try { muted = sessionStorage.getItem("music") === "off"; } catch { /* private mode */ }
      if (!muted) a.play().catch(() => {});
    };
    const on = () => setPlaying(true), off = () => setPlaying(false);
    window.addEventListener("invitation:opened", start);
    a.addEventListener("play", on); a.addEventListener("pause", off);
    return () => { window.removeEventListener("invitation:opened", start); a.removeEventListener("play", on); a.removeEventListener("pause", off); };
  }, []);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => {}); try { sessionStorage.setItem("music", "on"); } catch { /* fine */ } }
    else { a.pause(); try { sessionStorage.setItem("music", "off"); } catch { /* fine */ } }
  }

  return (
    <>
      <audio ref={audio} src={url} loop preload="none" data-testid="site-music" />
      <button type="button" onClick={toggle} className={`music-btn ${playing ? "is-playing" : ""} ${raised ? "is-raised" : ""}`}
        aria-pressed={playing} aria-label={playing ? "Mute the music" : "Play the music"} title={name}>
        <span aria-hidden className="music-bars"><i /><i /><i /><i /></span>
      </button>
    </>
  );
}
