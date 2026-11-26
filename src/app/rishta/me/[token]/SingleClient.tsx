"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { safeCall } from "@/lib/core/safe-call";
import { shrink } from "@/app/couple/site/GalleryUploader";
import { ProfileFields, formFields, type ProfileValues } from "@/app/rishta/ProfileFields";
import type { Card, Match } from "@/lib/rishta/match";
import { REPORT_REASONS } from "@/lib/rishta/rules";
import {
  addRishtaPhotoAction, deleteMyRishtaAction, leaveRishtaAction, publishRishtaAction, removeRishtaPhotoAction, requestRishtaCodeAction,
  rishtaBlockAction, rishtaInterestAction, rishtaIntroduceAction, rishtaReportAction, saveMyRishtaAction, verifyRishtaCodeAction,
} from "./actions";

type Msg = { ok: boolean; text: string } | null;
const Alert = ({ m }: { m: Msg }) => (m ? <p className="r-alert" role={m.ok ? "status" : "alert"}>{m.text}</p> : null);

/* ── the passcode ─────────────────────────────────────────────────────── */

export function CodeGate({ token, firstName, masked }: { token: string; firstName: string; masked: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const send = () => start(async () => {
    const r = await safeCall(() => requestRishtaCodeAction(token));
    if (r.ok) { setSent(true); setMsg({ ok: true, text: `We've emailed a 6-digit code to ${masked}. It works for 10 minutes.` }); }
    else setMsg({ ok: false, text: r.error });
  });
  const check = (code: string) => start(async () => {
    const r = await safeCall(() => verifyRishtaCodeAction(token, code));
    if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error });
  });
  return (
    <div className="r-card mt-8 grid gap-4">
      <h2 className="font-display text-2xl break-words">Hello {firstName}</h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Your family started a Rishta Corner profile for you. To open it, we&apos;ll email a code to {masked}, so only you can see it, change it or publish it.
      </p>
      <Alert m={msg} />
      {sent ? (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); check(String(new FormData(e.currentTarget).get("code") ?? "")); }}>
          <label>
            <span className="r-label">The code from the email</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="r-input text-center text-2xl tracking-[0.4em]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="r-btn" disabled={busy}>{busy ? "Checking…" : "Open my profile"}</button>
            <button type="button" className="r-btn-quiet" disabled={busy} onClick={send}>Send a new code</button>
          </div>
        </form>
      ) : (
        <button type="button" className="r-btn justify-self-start" disabled={busy} onClick={send}>{busy ? "Sending…" : "Email me a code"}</button>
      )}
      <p className="r-note">Not you? Just close this page. Nothing is shown to anyone unless {firstName} publishes it.</p>
    </div>
  );
}

/* ── their own profile ───────────────────────────────────────────────── */

export function MyProfile({ token, v, photos, canPhoto, status, published, phaseOpen, opensOn, notice, declarations }: {
  token: string; v: ProfileValues; photos: { src: string }[]; canPhoto: boolean;
  status: "draft" | "pending" | "live" | "removed"; published: boolean; phaseOpen: boolean; opensOn: string;
  notice: React.ReactNode; declarations: { id: string; text: string }[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [gone, setGone] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const removed = status === "removed";

  const save = () => {
    const f = form.current;
    if (!f || !f.reportValidity()) return;
    start(async () => {
      const r = await safeCall(() => saveMyRishtaAction(token, formFields(f)));
      setMsg(r.ok ? { ok: true, text: published ? "Saved. The couple will take a quick look before it shows again." : "Saved." } : { ok: false, text: r.error });
      router.refresh();
    });
  };
  const upload = (files: FileList | null) => {
    const f0 = files?.[0];
    if (!f0) return;
    start(async () => {
      try {
        const { blob, width, height } = await shrink(f0);
        const fd = new FormData();
        fd.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        fd.set("width", String(width)); fd.set("height", String(height));
        const r = await safeCall(() => addRishtaPhotoAction(token, fd));
        setMsg(r.ok ? { ok: true, text: "Photo added." } : { ok: false, text: r.error });
        router.refresh();
      } catch {
        setMsg({ ok: false, text: "That file couldn't be read as a photo. Try a JPG or PNG." });
      } finally {
        if (file.current) file.current.value = "";
      }
    });
  };
  const unphoto = (i: number) => start(async () => {
    const r = await safeCall(() => removeRishtaPhotoAction(token, i));
    setMsg(r.ok ? { ok: true, text: "Photo removed." } : { ok: false, text: r.error });
    router.refresh();
  });
  const publishIt = (fd: FormData) => {
    const ticked = declarations.filter((d) => fd.get(d.id) === "on").map((d) => d.id);
    const marketing = fd.get("marketing") === "on";
    const f = form.current;
    if (!f || !f.reportValidity()) return;
    start(async () => {
      const s = await safeCall(() => saveMyRishtaAction(token, formFields(f)));
      if (!s.ok) { setMsg({ ok: false, text: s.error }); return; }
      const r = await safeCall(() => publishRishtaAction(token, ticked, marketing));
      setMsg(r.ok ? { ok: true, text: "Published. The couple will take a quick look, then other guests can see it." } : { ok: false, text: r.error });
      router.refresh();
    });
  };
  const deleteAll = () => start(async () => {
    const r = await safeCall(() => deleteMyRishtaAction(token));
    if (r.ok) setGone(true); else setMsg({ ok: false, text: r.error });
  });

  if (gone) {
    return (
      <div className="r-card mt-8">
        <h2 className="font-display text-2xl">Your profile is deleted</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>Your profile, photos and everything linked to it are gone. You can close this page.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-6">
      <Alert m={msg} />
      {removed ? (
        <p className="r-alert">The couple removed this profile, so it isn&apos;t shown to anyone. You can still delete it below.</p>
      ) : (
        <form ref={form} className="r-card" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <h2 className="font-display text-2xl">Your profile</h2>
          <p className="r-note mt-1">Your family filled this in. Change anything that isn&apos;t right; it&apos;s yours now.</p>
          <div className="mt-6"><ProfileFields v={v} who="you" /></div>
          <div className="mt-6"><button type="submit" className="r-btn-quiet" disabled={busy}>Save changes</button></div>
        </form>
      )}

      {!removed && (
        <section className="r-card" aria-label="Photos">
          <h2 className="font-display text-2xl">Photos</h2>
          <p className="r-note mt-1">Up to 3. We remove hidden details such as location before saving. Only guests who can see your profile see them.</p>
          {photos.length > 0 && (
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {photos.map((ph, i) => (
                <li key={ph.src} className="grid gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.src} alt={`Photo ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                  <button type="button" className="r-note underline" disabled={busy} onClick={() => unphoto(i)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {canPhoto ? (
            photos.length < 3 && (
              <label className="r-btn-quiet mt-4 cursor-pointer">
                {busy ? "Working…" : "Add a photo"}
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} />
              </label>
            )
          ) : (
            <p className="r-note mt-3">Photo uploads aren&apos;t switched on yet.</p>
          )}
        </section>
      )}

      {!removed && !published && (
        <form className="r-card" onSubmit={(e) => { e.preventDefault(); publishIt(new FormData(e.currentTarget)); }} aria-label="Publish">
          <h2 className="font-display text-2xl">Before you publish</h2>
          <div className="mt-3 grid gap-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{notice}</div>
          <div className="mt-5 grid gap-3">
            {declarations.map((d) => (
              <label key={d.id} className="r-check"><input type="checkbox" name={d.id} required /><span>{d.text}</span></label>
            ))}
            <label className="r-check mt-2"><input type="checkbox" name="marketing" /><span>Optional: One Tap Invites may email me about its other services. You can say no and still publish.</span></label>
          </div>
          <button type="submit" className="r-btn mt-6" disabled={busy}>{busy ? "Publishing…" : "Publish my profile"}</button>
          {!phaseOpen && <p className="r-note mt-3">Rishta Corner opens on {opensOn}. Your profile will show from then.</p>}
        </form>
      )}

      <section className="r-card" aria-label="Delete">
        <h2 className="font-display text-xl">Delete my profile</h2>
        <p className="r-note mt-1">Deletes your profile and photos straight away. Anyone you matched with won&apos;t see you any more.</p>
        {deleting ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="r-btn" disabled={busy} onClick={deleteAll}>Yes, delete everything</button>
            <button type="button" className="r-btn-quiet" onClick={() => setDeleting(false)}>Keep my profile</button>
          </div>
        ) : (
          <button type="button" className="r-btn-quiet mt-4" onClick={() => setDeleting(true)}>Delete my profile</button>
        )}
      </section>
    </div>
  );
}

/* ── other guests ─────────────────────────────────────────────────────── */

function Facts({ c }: { c: Card }) {
  const bits = [`${c.age}`, c.city, c.profession, c.education].filter(Boolean);
  return (
    <>
      <h3 className="font-display text-2xl break-words" style={{ overflowWrap: "anywhere" }}>{c.firstName}</h3>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)", overflowWrap: "anywhere" }}>{bits.join(", ")}</p>
      {c.relation && <p className="r-note mt-1" style={{ overflowWrap: "anywhere" }}>{c.relation}</p>}
      {c.bio && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line" style={{ overflowWrap: "anywhere" }}>{c.bio}</p>}
    </>
  );
}

function Photos({ c }: { c: Card }) {
  if (!c.photoCount) return null;
  return (
    <div className="mb-4 flex snap-x gap-2 overflow-x-auto">
      {Array.from({ length: c.photoCount }, (_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={`/rishta/photo/${c.id}/${i}`} alt={`${c.firstName}, photo ${i + 1}`} loading="lazy" className="aspect-[3/4] w-[70%] max-w-[16rem] flex-none snap-start object-cover" />
      ))}
    </div>
  );
}

const REASONS = Object.entries(REPORT_REASONS);

function SafetyMenu({ token, c, onDone }: { token: string; c: Card; onDone: (m: Msg) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState<"menu" | "block" | "report" | null>(null);
  const [busy, start] = useTransition();
  const blockIt = () => start(async () => {
    const r = await safeCall(() => rishtaBlockAction(token, c.id));
    onDone(r.ok ? { ok: true, text: `${c.firstName} is hidden. Neither of you will see the other again.` } : { ok: false, text: r.error });
    router.refresh();
  });
  const reportIt = (fd: FormData) => start(async () => {
    const r = await safeCall(() => rishtaReportAction(token, c.id, String(fd.get("reason") ?? ""), String(fd.get("note") ?? "")));
    onDone(r.ok ? { ok: true, text: "Thanks. The grievance officer will look into it, and you won't see each other again." } : { ok: false, text: r.error });
    router.refresh();
  });
  if (!open) return <button type="button" className="r-note underline" onClick={() => setOpen("menu")}>Report or hide</button>;
  if (open === "menu") {
    return (
      <span className="flex flex-wrap gap-2">
        <button type="button" className="r-btn-quiet" onClick={() => setOpen("block")}>Hide {c.firstName}</button>
        <button type="button" className="r-btn-quiet" onClick={() => setOpen("report")}>Report</button>
        <button type="button" className="r-note underline" onClick={() => setOpen(null)}>Cancel</button>
      </span>
    );
  }
  if (open === "block") {
    return (
      <span className="grid gap-2">
        <span className="r-note">Hide {c.firstName} for good? They won&apos;t be told.</span>
        <span className="flex flex-wrap gap-2">
          <button type="button" className="r-btn-quiet" disabled={busy} onClick={blockIt}>Yes, hide</button>
          <button type="button" className="r-note underline" onClick={() => setOpen(null)}>Cancel</button>
        </span>
      </span>
    );
  }
  return (
    <form className="grid w-full gap-2" onSubmit={(e) => { e.preventDefault(); reportIt(new FormData(e.currentTarget)); }}>
      <label><span className="r-label">What&apos;s wrong?</span>
        <select name="reason" required className="r-input" defaultValue=""><option value="" disabled>Choose one</option>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label><span className="r-label">Anything else (optional)</span><textarea name="note" maxLength={1000} rows={2} className="r-input" /></label>
      <span className="flex flex-wrap gap-2">
        <button type="submit" className="r-btn-quiet" disabled={busy}>Send report</button>
        <button type="button" className="r-note underline" onClick={() => setOpen(null)}>Cancel</button>
      </span>
    </form>
  );
}

export function People({ token, cards }: { token: string; cards: Card[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const toggle = (c: Card) => start(async () => {
    const r = await safeCall(() => rishtaInterestAction(token, c.id, !c.interested));
    setMsg(r.ok ? null : { ok: false, text: r.error });
    router.refresh();
  });
  if (!cards.length) {
    return <p className="r-card mt-8 text-sm" style={{ color: "var(--ink-soft)" }}>No one to show yet. As other guests publish, they&apos;ll appear here. Check back in a day or two.</p>;
  }
  return (
    <div className="mt-8 grid gap-5">
      <Alert m={msg} />
      <p className="r-note">Tap Interested if you&apos;d like to know more. They aren&apos;t told unless they&apos;re interested too.</p>
      {cards.map((c) => (
        <article key={c.id} className="r-card" aria-label={c.firstName}>
          <Photos c={c} />
          <Facts c={c} />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={c.interested ? "r-btn-quiet" : "r-btn"} aria-pressed={c.interested} disabled={busy} onClick={() => toggle(c)}>
              {c.interested ? "Interested ✓ (tap to undo)" : "Interested"}
            </button>
            <SafetyMenu token={token} c={c} onDone={setMsg} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function Matches({ token, list, hasContact }: { token: string; list: Match[]; hasContact: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const intro = (m: Match) => start(async () => {
    const r = await safeCall(() => rishtaIntroduceAction(token, m.id));
    setMsg(r.ok ? { ok: true, text: m.introduceTheirs ? "Done. Your families' contacts are shown below." : `Done. When ${m.firstName} agrees too, you'll both see each other's family contact.` } : { ok: false, text: r.error });
    router.refresh();
  });
  if (!list.length) return <p className="r-card mt-8 text-sm" style={{ color: "var(--ink-soft)" }}>No matches yet. When you and someone are both interested, they&apos;ll show here.</p>;
  return (
    <div className="mt-8 grid gap-5">
      <Alert m={msg} />
      {list.map((m) => (
        <article key={m.id} className="r-card" aria-label={m.firstName}>
          <Photos c={m} />
          <Facts c={m} />
          <p className="r-alert mt-4">You&apos;re both interested.</p>
          {m.externalUrl && <a href={m.externalUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-sm underline">Their full profile ↗</a>}
          <div className="mt-4">
            {m.family ? (
              <p className="text-sm">
                Their family: {m.family.name ?? "Family contact"}{m.family.phone && <>, <a href={`tel:${m.family.phone}`} className="underline">{m.family.phone}</a></>}
              </p>
            ) : m.introduceMine ? (
              <p className="r-note">You&apos;ve agreed to introduce your families. Waiting for {m.firstName}.</p>
            ) : hasContact ? (
              <button type="button" className="r-btn" disabled={busy} onClick={() => intro(m)}>Introduce our families</button>
            ) : (
              <p className="r-note">To introduce your families, first add a family contact to your profile.</p>
            )}
            {!m.family && !m.introduceMine && <p className="r-note mt-2">This shares your family contact&apos;s name and phone with {m.firstName}, once they agree too.</p>}
          </div>
          <div className="mt-4"><SafetyMenu token={token} c={m} onDone={setMsg} /></div>
        </article>
      ))}
    </div>
  );
}

export function Leave({ token }: { token: string }) {
  const router = useRouter();
  return <button type="button" className="r-note underline" onClick={async () => { await safeCall(() => leaveRishtaAction(token)); router.refresh(); }}>Sign out</button>;
}
