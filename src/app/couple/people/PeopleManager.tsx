"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Person } from "@/lib/auth/people";
import { addPersonAction, removePersonAction, renameMeAction, updatePersonAction } from "./actions";
import { SaveBar } from "@/components/FloatingSave";
import { DEFAULT_SIDE_NAMES, type SideNames } from "@/lib/site/side-names";
import { safeCall } from "@/lib/core/safe-call";

type Draft = Pick<Person, "name" | "role" | "side" | "site" | "guests" | "print">;
const BLANK: Draft = { name: "", role: "committee", side: "bride", site: "none", guests: "full", print: "none" };
const LEVELS = [["none", "No access"], ["view", "View only"], ["full", "Full access"]] as const;

/** The selects for one person's role, side and access (used to add and to change). */
function AccessFields({ d, set, who, canMakeCouple, disabled, names }: {
  d: Draft; set: (patch: Partial<Draft>) => void; who: string; canMakeCouple: boolean; disabled?: boolean; names: SideNames;
}) {
  const couple = d.role === "couple";
  const sel = "portal-input";
  return (
    <>
      <td>
        <select aria-label={`Role for ${who}`} className={sel} disabled={disabled} value={d.role} onChange={(e) => set({ role: e.target.value as Draft["role"] })}>
          <option value="committee">Committee</option>
          {(canMakeCouple || couple) && <option value="couple">Couple</option>}
        </select>
      </td>
      <td>
        <select aria-label={`Side for ${who}`} className={sel} disabled={disabled || couple} value={couple ? "both" : d.side} onChange={(e) => set({ side: e.target.value as Draft["side"] })}>
          <option value="bride">{names.bride}&apos;s side</option>
          <option value="groom">{names.groom}&apos;s side</option>
          <option value="both">Both sides</option>
        </select>
      </td>
      <td className="text-center text-neutral-500">Yes</td>
      <td className="text-center text-neutral-500">Yes</td>
      {(["site", "guests"] as const).map((a) => (
        <td key={a}>
          <select aria-label={`${a === "site" ? "Edit your site" : "Guest list"} for ${who}`} className={sel} disabled={disabled || couple} value={couple ? "full" : d[a]} onChange={(e) => set({ [a]: e.target.value } as Partial<Draft>)}>
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </td>
      ))}
      <td>
        <select aria-label={`Print cards for ${who}`} className={sel} disabled={disabled || couple} value={couple ? "full" : d.print} onChange={(e) => set({ print: e.target.value as Draft["print"] })}>
          <option value="none">No access</option>
          <option value="full">Can print</option>
        </select>
      </td>
    </>
  );
}

export function PeopleManager({ weddingId, admin, people, meId, owner, sideNames = DEFAULT_SIDE_NAMES }: {
  weddingId: string; admin: boolean; people: Person[]; meId: string; owner: boolean;
  /** "Pooja", "Spandan" for the Side choices */
  sideNames?: SideNames;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState("");
  const [fresh, setFresh] = useState<Draft>(BLANK);
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const wid = admin ? { weddingId } : {};

  const run = (fn: () => Promise<{ ok: true; note?: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setFlash(null);
      const r = await fn();
      setFlash(r.ok ? { ok: true, text: r.note ?? "Saved." } : { ok: false, text: r.error === "forbidden" ? "You're not allowed to do that." : r.error });
      if (r.ok) { after?.(); router.refresh(); }
    });

  /* one Save for every row that was changed: your own name, others' access */
  const saveAll = () =>
    start(async () => {
      setFlash(null);
      const failed: string[] = [];
      const left: Record<string, Draft> = {};
      for (const [id, d] of Object.entries(edits)) {
        const r = id === meId
          ? await safeCall(() => renameMeAction({ ...wid, name: d.name }))
          : await safeCall(() => updatePersonAction({ ...wid, userId: id, ...d }));
        if (!r.ok) { failed.push(r.error === "forbidden" ? "You're not allowed to do that." : r.error); left[id] = d; }
      }
      setEdits(left);
      setFlash(failed.length ? { ok: false, text: failed[0] } : { ok: true, text: "Saved." });
      router.refresh();
    });

  const head = (
    <thead>
      <tr>
        <th className="p-3">Name</th>
        <th className="p-3">Email</th>
        <th className="p-3">Role</th>
        <th className="p-3">Side</th>
        <th className="p-3 text-center">Dashboard</th>
        <th className="p-3 text-center">Overview</th>
        <th className="p-3">Edit your site</th>
        <th className="p-3">Guest list</th>
        <th className="p-3">Print cards</th>
        <th className="p-3" />
      </tr>
    </thead>
  );

  return (
    <>
      {flash && (
        <p className={`mb-6 rounded-xl border px-4 py-3 text-sm ${flash.ok ? "border-emerald-100 bg-emerald-50 text-emerald-900" : "border-red-100 bg-red-50 text-red-900"}`} role={flash.ok ? "status" : "alert"}>
          {flash.text}
        </p>
      )}

      <section id="add" className="portal-panel mb-6 p-6">
        <p className="portal-eyebrow">Add a person</p>
        <form
          className="mt-4"
          onSubmit={(e) => { e.preventDefault(); run(() => addPersonAction({ ...wid, email, ...fresh }), () => { setEmail(""); setFresh(BLANK); }); }}
        >
          <div className="guest-table people-table">
            <table className="portal-table w-full min-w-[54rem] text-left text-sm">
              {head}
              <tbody>
                <tr>
                  <td><input aria-label="Name" className="portal-input" value={fresh.name} maxLength={80} placeholder="Meena aunty" onChange={(e) => setFresh({ ...fresh, name: e.target.value })} /></td>
                  <td><input aria-label="Email" type="email" required className="portal-input" value={email} placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} /></td>
                  <AccessFields names={sideNames} d={fresh} set={(p) => setFresh({ ...fresh, ...p })} who="the new person" canMakeCouple={owner} />
                  <td className="text-right"><button type="submit" disabled={pending || !email.trim()} className="portal-button">Add</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-500">They get an email telling them to sign in with this address. Each email address can belong to one wedding.</p>
        </form>
      </section>

      <section id="list" className="portal-panel p-6">
        <p className="portal-eyebrow">Everyone with access · {people.length}</p>
        <div className="guest-table people-table mt-4">
          <table className="portal-table w-full min-w-[54rem] text-left text-sm">
            {head}
            <tbody>
              {people.map((p) => {
                const who = p.name || p.email;
                const me = p.id === meId;
                const locked = me || p.isOwner || (p.role === "couple" && !owner);
                const d = edits[p.id] ?? p;
                return (
                  <tr key={p.id} data-testid="person">
                    <td>
                      {locked && !me
                        ? <span className="font-medium">{p.name || "—"}</span>
                        : <input aria-label={`Name for ${who}`} className="portal-input" maxLength={80} value={d.name} onChange={(e) => setEdits({ ...edits, [p.id]: { ...d, name: e.target.value } })} />}
                      <span className="mt-1 block text-xs text-neutral-500">
                        {me ? "You" : p.isOwner ? "Set this wedding up" : p.signedIn ? "Has signed in" : "Hasn't signed in yet"}{me && p.isOwner ? " · set this wedding up" : ""}
                      </span>
                    </td>
                    <td className="break-all text-neutral-600">{p.email}</td>
                    <AccessFields names={sideNames} d={d} set={(patch) => setEdits({ ...edits, [p.id]: { ...d, ...patch } })} who={who} canMakeCouple={owner} disabled={locked} />
                    <td className="whitespace-nowrap text-right">
                      {!locked && (confirming === p.id ? (
                        <>
                          <button type="button" disabled={pending} className="portal-link mr-3 text-red-700" onClick={() => run(() => removePersonAction({ ...wid, userId: p.id }), () => setConfirming(null))}>Yes, remove</button>
                          <button type="button" className="portal-link" onClick={() => setConfirming(null)}>Keep</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="portal-link" aria-label={`Remove ${who}`} onClick={() => setConfirming(p.id)}>Remove</button>
                        </>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <SaveBar count={Object.keys(edits).length} pending={pending} onSave={saveAll} />
    </>
  );
}
