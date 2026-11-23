import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireAccess } from "@/lib/auth/authz";
import { sideNamesOf } from "@/lib/site/side-names";
import { asFamilySide, namesFor } from "@/lib/site/looks";
import { cardWords } from "@/lib/invitation/words";
import { CARD_LANGS, isCardLang, langLabel, langNative } from "@/lib/invitation/langs";
import { PortalFrame } from "../../../PortalFrame";
import { PortalNav } from "../../../PortalNav";
import { FloatingSave } from "@/components/FloatingSave";
import { saveCardWordsAction } from "../../../card-words-actions";
import { CardWordsEditor } from "./CardWordsEditor";

export const dynamic = "force-dynamic";

/** The printed cards' words in Gujarati or Hindi, to check and edit. Print only. */
export default async function CardWords({
  params,
  searchParams,
}: {
  params: Promise<{ family: string }>;
  searchParams: Promise<{ wedding?: string; lang?: string; saved?: string }>;
}) {
  const family = asFamilySide((await params).family);
  if (!family) notFound();
  const staff = await requireAccess("print", family, "full");
  const sp = await searchParams;
  const lang = isCardLang(sp.lang) && sp.lang !== "en" ? sp.lang : "gu";
  const admin = staff.role === "admin";
  let weddingId = admin ? (sp.wedding ?? null) : staff.weddingId;
  if (admin && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;
  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const words = await cardWords(weddingId, family, lang);
  if (!wedding || !words) notFound();
  const sn = sideNamesOf(wedding);
  const q = (l: string) => `/couple/${family}/print/words?${admin ? `wedding=${weddingId}&` : ""}lang=${l}`;
  const printHref = `/couple/${family}/print${admin ? `?wedding=${weddingId}` : ""}`;

  return (
    <main className="portal-page">
      <PortalNav sideNames={sn} names={namesFor(wedding, family).couple} current={family} page="print" weddingId={weddingId} admin={admin} access={staff.access} />
      <PortalFrame key={`${family}-${lang}`} roomy jump={[]}>
        <header className="mb-6">
          <Link href={printHref} className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800">← Back to print cards</Link>
          <h1 className="portal-heading mt-3">
            {sn[family]}&apos;s family&apos;s cards in {langLabel(lang)} <span className="indic-script font-normal text-neutral-500" lang={lang}>· {langNative(lang)}</span>
          </h1>
          <p className="portal-subheading mt-3 max-w-3xl">
            Every line of the printed cards, with the English beside it. The usual invitation phrases, dates and times are
            written out for you; names, places and addresses are spelled out as a first draft, so read them through and fix
            any spelling. Your words are used <b>only on the printed cards</b>. Your website stays as it is.
          </p>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Language">
            {CARD_LANGS.filter((l) => l.id !== "en").map((l) => (
              <Link key={l.id} href={q(l.id)} aria-current={l.id === lang ? "page" : undefined}
                className={l.id === lang ? "portal-button" : "portal-button-secondary"}>
                {l.label} · <span className="indic-script" lang={l.id}>{l.native}</span>
              </Link>
            ))}
          </nav>
        </header>
        <CardWordsEditor fields={words.fields} mine={words.mine} lang={lang} family={family} weddingId={weddingId} admin={admin} />
        <p className="mt-8 text-sm text-neutral-500">
          Saved? <Link href={printHref} className="underline underline-offset-4">See it on the card →</Link> Choose {langLabel(lang)} under
          &ldquo;Language on the card&rdquo; and the preview shows these words.
        </p>
      </PortalFrame>
      <FloatingSave key={`${lang}-${sp.saved ?? ""}`} action={saveCardWordsAction} label="Save wording" />
    </main>
  );
}
