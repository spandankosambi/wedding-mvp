/*
 * The profile's fields, shared by the household's draft and the single's own
 * edit. Plain inputs with starting values; the form around them reads them
 * with formFields(). Styled by each wedding's theme (r-* classes).
 */

export type ProfileValues = {
  firstName: string; gender: "woman" | "man"; lookingFor: "woman" | "man"; birthYear: number | null;
  city: string; education: string; profession: string; bio: string;
  relation: string | null; relationShown: boolean; externalUrl: string | null;
  familyContactName: string | null; familyContactPhone: string | null;
};

export const BLANK: ProfileValues = {
  firstName: "", gender: "woman", lookingFor: "man", birthYear: null, city: "", education: "", profession: "", bio: "",
  relation: null, relationShown: false, externalUrl: null, familyContactName: null, familyContactPhone: null,
};

/** Everything in the form, as the server's profile check expects it. */
export function formFields(form: HTMLFormElement): Record<string, unknown> {
  const fd = new FormData(form);
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) out[k] = typeof v === "string" ? v : "";
  out.relationShown = fd.get("relationShown") === "on";
  return out;
}

const L = ({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="r-label">{label}{note && <span className="ml-1 opacity-75">· {note}</span>}</span>
    {children}
  </label>
);

function Choice({ name, value, options, legend }: { name: string; value: string; options: [string, string][]; legend: string }) {
  return (
    <fieldset>
      <legend className="r-label">{legend}</legend>
      <div className="flex gap-2">
        {options.map(([v, label]) => (
          <label key={v} className="r-choice">
            <input type="radio" name={name} value={v} defaultChecked={value === v} required />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfileFields({ v, who = "they" }: { v: ProfileValues; who?: "they" | "you" }) {
  const you = who === "you";
  const year = new Date().getFullYear();
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <L label="First name"><input name="firstName" defaultValue={v.firstName} required maxLength={40} autoComplete="off" className="r-input" /></L>
        <L label="Year of birth"><input name="birthYear" type="number" inputMode="numeric" min={1940} max={year - 18} defaultValue={v.birthYear ?? ""} required className="r-input" placeholder="1997" /></L>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Choice legend={you ? "You are" : "They are"} name="gender" value={v.gender} options={[["woman", "A woman"], ["man", "A man"]]} />
        <Choice legend={you ? "You'd like to meet" : "They'd like to meet"} name="lookingFor" value={v.lookingFor} options={[["man", "A man"], ["woman", "A woman"]]} />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <L label="City"><input name="city" defaultValue={v.city} maxLength={60} className="r-input" placeholder="Pune" /></L>
        <L label="Studied"><input name="education" defaultValue={v.education} maxLength={80} className="r-input" placeholder="B.Com, Symbiosis" /></L>
        <L label="Works as"><input name="profession" defaultValue={v.profession} maxLength={80} className="r-input" placeholder="Architect" /></L>
      </div>
      <L label={you ? "A few lines about you" : "A few lines about them"} note="up to 600 characters">
        <textarea name="bio" defaultValue={v.bio} maxLength={600} rows={4} className="r-input" placeholder="Loves trekking, makes the best chai in the family…" />
      </L>
      <div className="grid gap-3">
        <L label="How they know the couple" note="optional"><input name="relation" defaultValue={v.relation ?? ""} maxLength={60} className="r-input" placeholder="Bride's cousin" /></L>
        <label className="r-check">
          <input type="checkbox" name="relationShown" defaultChecked={v.relationShown} />
          <span>Show this on the profile (the couple checks it first)</span>
        </label>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <L label="Family contact's name" note="shared only if both families agree"><input name="familyContactName" defaultValue={v.familyContactName ?? ""} maxLength={60} className="r-input" placeholder="Rekha Mehta (mother)" /></L>
        <L label="Their phone"><input name="familyContactPhone" type="tel" inputMode="tel" defaultValue={v.familyContactPhone ?? ""} maxLength={20} className="r-input" placeholder="98765 43210" /></L>
      </div>
      <L label="Jeevansathi or Shaadi.com profile" note="optional, shown only after a match">
        <input name="externalUrl" type="url" inputMode="url" defaultValue={v.externalUrl ?? ""} maxLength={300} className="r-input" placeholder="https://www.shaadi.com/…" />
      </L>
    </div>
  );
}
