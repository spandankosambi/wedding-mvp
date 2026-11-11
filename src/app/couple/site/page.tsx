import Link from "next/link";
import { EventSideField } from "./EventSideField";
import { asFamilySide, getLooks, hasPart, namesFor, otherSide, samePart, sideName, type FamilySide, type Look, type LookPart } from "@/lib/looks";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { istParts, MAX_STAYS } from "@/lib/editor";
import { EVENT_PRESETS } from "@/lib/presets";
import { fmtWeddingDate } from "@/lib/format";
import { ThemeSwitcher } from "../ThemeSwitcher";
import { SaveButton } from "./SaveButton";
import { GalleryUploader } from "./GalleryUploader";
import { StaysEditor } from "./StaysEditor";
import { galleryOf, photoStorageConfigured, MAX_GALLERY_PHOTOS } from "@/lib/gallery";
import {
  saveWords, saveWording, saveTravel, saveEvent, addPresetEvent, toggleEvent, removeEvent, moveEventAction, sortEvents,
  saveGallerySettings, removeGalleryPhotoAction, moveGalleryPhotoAction, copyPartAction,
} from "./actions";

export const dynamic = "force-dynamic";

const Field = ({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <label className={`block ${className}`}>
    <span className="text-xs font-medium text-neutral-600">{label}</span>
    {hint && <span className="ml-2 text-xs text-neutral-400">{hint}</span>}
    <div className="mt-1.5">{children}</div>
  </label>
);

/** "Same as the groom's family" — offered once the other family has filled this part in. */
function SameAsPartner({ part, family, partner, mine, hidden }: { part: LookPart; family: FamilySide; partner: Look; mine: Look; hidden: React.ReactNode }) {
  if (!hasPart(partner, part) || samePart(partner, mine, part)) return null;
  return (
    <form action={copyPartAction}>
      {hidden}
      <input type="hidden" name="part" value={part} />
      <button type="submit" className="portal-button-secondary">Same as the {otherSide(family)}&apos;s family</button>
    </form>
  );
}

export default async function SiteEditorPage({ searchParams }: { searchParams: Promise<{ wedding?: string; family?: string; saved?: string; error?: string; section?: string }> }) {
  const staff = await requireRole(["couple", "admin"]);
  const sp = await searchParams;
  let weddingId = staff.role === "admin" ? (sp.wedding ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;

  const family: FamilySide = asFamilySide(sp.family) ?? "bride";
  const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const looks = await getLooks(weddingId);
  const look = looks[family], partner = looks[otherSide(family)];
  // this family's section: common events and its own
  const evs = (await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder, events.startsAt))
    .filter((e) => e.side === "both" || e.side === family);
  const coupleNames = namesFor(w, family).couple; // this family's name order
  const hidden = evs.filter((e) => !e.isPublished).length;
  const wid = (
    <>
      {staff.role === "admin" && <input type="hidden" name="weddingId" value={weddingId} />}
      <input type="hidden" name="family" value={family} />
    </>
  );
  const gal = galleryOf(look);
  const uploadsOn = photoStorageConfigured();
  const adminQ = staff.role === "admin" ? `wedding=${weddingId}&` : "";
  const same = (part: LookPart) => <SameAsPartner part={part} family={family} partner={partner} mine={look} hidden={wid} />;

  return (
    <main className="portal-page">
      <div className="portal-shell max-w-5xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="portal-eyebrow">
              <Link href={`/couple${adminQ ? `?${adminQ.slice(0, -1)}` : ""}`} className="hover:text-stone-950">{coupleNames}</Link>
              <span className="mx-1 text-stone-300">/</span>
              <Link href={`/couple/${family}${adminQ ? `?${adminQ.slice(0, -1)}` : ""}`} className="hover:text-stone-950">{sideName(family)}</Link>
              <span className="mx-1 text-stone-300">/</span> site
            </p>
            <h1 className="portal-heading mt-2">Edit the {family === "bride" ? "bride" : "groom"}&apos;s family&apos;s site</h1>
            <p className="portal-subheading mt-3">
              What the {family}&apos;s guests see: your look, words, celebrations, travel and photos. The names, date
              and city are shared — change them on the <Link href={`/couple${adminQ ? `?${adminQ.slice(0, -1)}` : ""}`} className="underline">dashboard</Link>.
            </p>
          </div>
          <a href={`/w/${w.slug}?side=${family}`} target="_blank" rel="noreferrer" className="portal-button-secondary">Preview site ↗</a>
        </header>

        {sp.saved && (
          <p className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            Saved. Your site is up to date.
          </p>
        )}
        {sp.error && (
          <p className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
            Couldn&apos;t save — {sp.error === "invalid input" ? "please check the highlighted fields (names, dates and a venue are required; links must start with https://)." : sp.error}
          </p>
        )}

        <div className="space-y-8">
          {/* ── Theme ───────────────────────────────────────────── */}
          <div id="theme">
            <ThemeSwitcher weddingId={weddingId} current={look.theme} slug={w.slug} coupleNames={coupleNames} family={family} partnerTheme={partner.theme} />
          </div>

          {/* ── Invitation wording: the site's opening and the printed cards ── */}
          <section id="wording" className="portal-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="portal-eyebrow">Invitation wording</p>
                <h2 className="mt-1 font-semibold">The words on your website and your printed cards</h2>
                <p className="mt-1 max-w-2xl text-sm text-neutral-500">
                  Your site opens the way your card does — the invocation and shloka at the top, then your parents inviting guests to the wedding.
                  Type in English, or in Hindi, Marathi or Sanskrit (Devanagari). Leave a box blank to leave it out.
                </p>
              </div>
              {same("wording")}
            </div>
            <form action={saveWording} className="mt-5 grid gap-4 md:grid-cols-2">
              {wid}
              <Field label="Invocation at the top" hint="optional">
                <input name="invocation" defaultValue={look.invocation ?? ""} maxLength={80} placeholder="|| Shree Ganeshaya Namah ||  or  ॥ श्री गणेशाय नमः ॥" className="portal-input" />
              </Field>
              <Field label="Blessing or shloka under the invocation" hint="optional">
                <textarea name="shloka" defaultValue={look.shloka ?? ""} maxLength={200} rows={2} className="portal-input resize-y"
                  placeholder={"वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ ।\nनिर्विघ्नं कुरु मे देव सर्वकार्येषु सर्वदा ॥"} />
              </Field>
              <Field label="RSVP contacts" hint="one per line — near the RSVP on the site, on the back of the card">
                <textarea name="rsvpContacts" defaultValue={look.rsvpContacts ?? ""} maxLength={240} rows={2} className="portal-input resize-y"
                  placeholder={family === "bride" ? "Anil Kulkarni +91 98220 12345" : "Rajesh Kosambi +91 98765 43210"} />
              </Field>
              <Field label="“With best compliments from”" hint="optional, one per line">
                <textarea name="compliments" defaultValue={look.compliments ?? ""} maxLength={240} rows={2} className="portal-input resize-y"
                  placeholder={family === "bride" ? "Kulkarni family\nand friends" : "Kosambi family\nand friends"} />
              </Field>
              <Field label="Closing line" hint="optional" className="md:col-span-2">
                <input name="closingLine" defaultValue={look.closingLine ?? ""} maxLength={160} placeholder="Your blessings are our gifts" className="portal-input" />
              </Field>
              <p className="text-xs text-neutral-500 md:col-span-2">
                Parents&apos; names are shared by both families — <Link href={`/couple${adminQ ? `?${adminQ.slice(0, -1)}` : ""}#details`} className="underline">change them on the dashboard</Link>.
              </p>
              <div className="md:col-span-2"><SaveButton /></div>
            </form>
          </section>

          {/* ── Words ───────────────────────────────────────────── */}
          <section id="words" className="portal-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="portal-eyebrow">Words</p>
                <h2 className="mt-1 font-semibold">Tagline, story, hashtag, contact</h2>
              </div>
              {same("words")}
            </div>
            <form action={saveWords} className="mt-5 grid gap-4 md:grid-cols-2">
              {wid}
              <Field label="Tagline" hint="one line under your names" className="md:col-span-2"><input name="heroTagline" defaultValue={look.heroTagline ?? ""} maxLength={160} placeholder="Two families, five celebrations, one big yes." className="portal-input" /></Field>
              <Field label="Your story" hint="how they met — leave blank to hide the section" className="md:col-span-2">
                <textarea name="story" defaultValue={look.story ?? ""} maxLength={2000} rows={4} className="portal-input resize-y" placeholder="They met over a spilled filter coffee at a Bengaluru hackathon…" />
              </Field>
              <Field label="Hashtag" hint="without the #"><input name="hashtag" defaultValue={look.hashtag ?? ""} maxLength={60} placeholder="AnanyaKaArjun" className="portal-input" /></Field>
              <Field label="Family contact" hint="shown if RSVPs close"><input name="contactPhone" defaultValue={look.contactPhone ?? ""} maxLength={40} placeholder="+91 98765 43210 (Rajesh)" className="portal-input" /></Field>
              <div className="md:col-span-2"><SaveButton /></div>
            </form>
          </section>

          {/* ── Events ──────────────────────────────────────────── */}
          <section id="events" className="portal-panel p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="portal-eyebrow">The celebrations</p>
                <h2 className="mt-1 font-semibold">
                  {evs.length} event{evs.length === 1 ? "" : "s"}{hidden ? ` · ${hidden} hidden` : ""}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Common events are shared with the other family — a change here shows on both sites.
                  Switch an event off to hide it from the site and the RSVP form without deleting it.
                </p>
              </div>
              {evs.length > 1 && (
                <form action={sortEvents}>{wid}<button className="portal-button-secondary" type="submit">Sort by date</button></form>
              )}
            </div>

            <div className="mt-6 space-y-4">
              {evs.map((e, i) => {
                const p = istParts(e.startsAt);
                return (
                  <details key={e.id} id={`event-${e.id}`} open={sp.section === `event-${e.id}` || (sp.saved === `event-${e.id}`)}
                    className={`group rounded-xl border ${e.isPublished ? "border-neutral-200 bg-white" : "border-dashed border-neutral-300 bg-neutral-50"}`}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                      <span className="w-6 text-xs tabular-nums text-neutral-400">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`font-medium ${e.isPublished ? "" : "text-neutral-400 line-through decoration-neutral-300"}`}>{e.name}</span>
                        <span className="ml-2 rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">
                          {e.side === "both" ? "Common" : "This family only"}
                        </span>
                        <span className="ml-2 text-xs text-neutral-400">{p.date} · {p.time} · {e.venueName}</span>
                      </span>
                      {!e.isPublished && <span className="portal-badge">hidden</span>}
                      <span className="text-xs text-neutral-400 group-open:hidden">edit ▾</span>
                      <span className="hidden text-xs text-neutral-400 group-open:inline">close ▴</span>
                    </summary>
                    <div className="border-t border-neutral-100 p-4">
                      <form action={saveEvent} className="grid gap-4 md:grid-cols-2">
                        {wid}
                        <input type="hidden" name="id" value={e.id} />
                        <Field label="Name"><input name="name" defaultValue={e.name} required maxLength={60} className="portal-input" /></Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Date"><input name="date" type="date" defaultValue={p.date} required className="portal-input" /></Field>
                          <Field label="Time (IST)"><input name="time" type="time" defaultValue={p.time} required className="portal-input" /></Field>
                        </div>
                        <Field label="Venue"><input name="venueName" defaultValue={e.venueName} required maxLength={120} className="portal-input" /></Field>
                        <Field label="Address" hint="end with the city"><input name="address" defaultValue={e.address} required maxLength={240} className="portal-input" /></Field>
                        <Field label="Map link" hint="Google Maps share link"><input name="mapUrl" type="url" defaultValue={e.mapUrl ?? ""} maxLength={500} placeholder="https://maps.app.goo.gl/…" className="portal-input" /></Field>
                        <Field label="Dress code"><input name="dressCode" defaultValue={e.dressCode ?? ""} maxLength={80} placeholder="Yellows / Traditional / Cocktail" className="portal-input" /></Field>
                        <Field label="A line about it" className="md:col-span-2"><input name="description" defaultValue={e.description ?? ""} maxLength={400} className="portal-input" /></Field>
                        <EventSideField initial={e.side} eventName={e.name} family={family} />
                        <label className="flex items-center gap-2 text-sm md:col-span-2">
                          <input type="checkbox" name="isPublished" defaultChecked={e.isPublished} className="h-4 w-4" />
                          Show this event on the site and RSVP form
                        </label>
                        <div className="md:col-span-2"><SaveButton /></div>
                      </form>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                        <form action={toggleEvent}>{wid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="isPublished" value={e.isPublished ? "false" : "true"} />
                          <button type="submit" className="portal-button-secondary">{e.isPublished ? "Hide from site" : "Show on site"}</button></form>
                        <form action={moveEventAction}>{wid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="dir" value="up" />
                          <button type="submit" className="portal-button-secondary" disabled={i === 0}>↑ Move up</button></form>
                        <form action={moveEventAction}>{wid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="dir" value="down" />
                          <button type="submit" className="portal-button-secondary" disabled={i === evs.length - 1}>↓ Move down</button></form>
                        <form action={removeEvent} className="ml-auto">{wid}<input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="portal-button-secondary" style={{ color: "#b91c1c" }}>Delete</button></form>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-4">
              <p className="text-xs font-medium text-neutral-600">Add a celebration</p>
              <p className="mt-1 text-xs text-neutral-400">Tap one to add it with a sensible date, dress code and blurb — then edit the venue.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EVENT_PRESETS.map((p) => (
                  <form key={p.name} action={addPresetEvent}>{wid}<input type="hidden" name="preset" value={p.name} />
                    <button type="submit" className="portal-badge hover:border-neutral-400 hover:text-neutral-900">+ {p.name}</button></form>
                ))}
                <form action={addPresetEvent}>{wid}<input type="hidden" name="preset" value="" />
                  <button type="submit" className="portal-badge hover:border-neutral-400 hover:text-neutral-900">+ Something else</button></form>
              </div>
            </div>
          </section>

          {/* ── Travel ──────────────────────────────────────────── */}
          <section id="travel" className="portal-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="portal-eyebrow">Travel &amp; stay</p>
                <h2 className="mt-1 font-semibold">Where out-of-town guests should stay</h2>
                <p className="mt-1 text-sm text-neutral-500">Leave everything blank to hide the section. A hotel ticked common shows on both families&apos; sites.</p>
              </div>
              {same("travel")}
            </div>
            <form action={saveTravel} className="mt-5 space-y-4">
              {wid}
              <StaysEditor initial={look.travel?.stays ?? []} family={family} max={MAX_STAYS} />
              <Field label="Getting there" hint="airport, distances, shuttles">
                <textarea name="gettingThere" defaultValue={look.travel?.gettingThere ?? ""} maxLength={1200} rows={3} className="portal-input resize-y" placeholder="Fly into Mumbai (BOM). Both hotels are 20–40 minutes from the terminals…" />
              </Field>
              <SaveButton />
            </form>
          </section>

          {/* ── Gallery ─────────────────────────────────────────── */}
          <section id="gallery" className="portal-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="portal-eyebrow">Gallery</p>
                <h2 className="mt-1 font-semibold">Your photos{gal.photos.length ? ` · ${gal.photos.length}` : ""}</h2>
              </div>
              {same("gallery")}
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              {gal.photos.length
                ? "These appear on your site in this order."
                : "Until you add photos, your site shows decorative illustrations here instead."}
            </p>

            <form action={saveGallerySettings} className="mt-5 flex flex-wrap items-center gap-4">
              {wid}
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="galleryEnabled" defaultChecked={gal.enabled} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium">Show the gallery on your site</span>
                  <span className="block text-xs text-neutral-500">Off hides the whole section. Your photos stay saved here.</span>
                </span>
              </label>
              <SaveButton />
            </form>

            {gal.photos.length > 0 && (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {gal.photos.map((ph, i) => (
                  <li key={ph.pathname} className="overflow-hidden rounded-xl border border-neutral-200 bg-white" data-testid="gallery-photo">
                    <img src={ph.url} alt={`Gallery photo ${i + 1}`} width={ph.width} height={ph.height} loading="lazy" className="aspect-square w-full object-cover" />
                    <div className="flex items-center gap-1 p-2">
                      <form action={moveGalleryPhotoAction}>{wid}<input type="hidden" name="pathname" value={ph.pathname} /><input type="hidden" name="dir" value="up" />
                        <button type="submit" disabled={i === 0} className="portal-badge disabled:opacity-30" aria-label={`Move photo ${i + 1} earlier`}>←</button></form>
                      <form action={moveGalleryPhotoAction}>{wid}<input type="hidden" name="pathname" value={ph.pathname} /><input type="hidden" name="dir" value="down" />
                        <button type="submit" disabled={i === gal.photos.length - 1} className="portal-badge disabled:opacity-30" aria-label={`Move photo ${i + 1} later`}>→</button></form>
                      <form action={removeGalleryPhotoAction} className="ml-auto">{wid}<input type="hidden" name="pathname" value={ph.pathname} />
                        <button type="submit" className="portal-badge" style={{ color: "#b91c1c" }} aria-label={`Remove photo ${i + 1}`}>Remove</button></form>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-4">
              {uploadsOn ? (
                <GalleryUploader weddingId={weddingId} admin={staff.role === "admin"} remaining={MAX_GALLERY_PHOTOS - gal.photos.length} family={family} />
              ) : (
                <p className="text-sm text-neutral-500">Photo uploads aren&apos;t switched on for this site yet.</p>
              )}
            </div>
          </section>

          <p className="text-center text-xs text-neutral-400">
            This family&apos;s guest list and invites live in its <Link href={`/committee?${adminQ}family=${family}`} className="underline">guest list</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
