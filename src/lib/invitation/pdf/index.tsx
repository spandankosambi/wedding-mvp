/* The print-ready PDF: the cards, then the envelope. */
import QRCode from "qrcode";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { Theme } from "@/themes/catalog";
import type { Invitation } from "../content";
import { canFold, panelSize, sheetFor, type InvitationOptions } from "../options";
import { paletteFor } from "../motifs";

import { registerFonts } from "./fonts";
import { Ctx } from "./primitives";
import { Front } from "./front";
import { Back, Insert } from "./back";
import { EnvelopePages } from "./envelope-pages";
import { FoldedPages } from "./folded-card";

export async function renderInvitationPdf(inv: Invitation, o: InvitationOptions, theme: Theme, part: "all" | "card" | "envelope" = "all"): Promise<Buffer> {
  registerFonts();
  // folded cards are portrait or square panels; a landscape one prints as a flat card
  if (o.eventLayout === "folded") {
    if (!canFold(o)) o = { ...o, eventLayout: "together" };
  }
  const sheet = sheetFor(o);
  const trim = panelSize(o); // one half of a folded card
  const c: Ctx = {
    p: paletteFor(theme, o.colours), s: Math.min(trim[0], trim[1]) / 127, trim, sheet, theme, o, script: o.nameFont === "script",
    arch: o.frame === "arch" && trim[1] > trim[0],
    grow: o.fill === "fuller" ? 1.4 : 1,
    labels: inv.labels,
  };
  const qr = inv.back.details.qrUrl
    ? await QRCode.toDataURL(inv.back.details.qrUrl, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
    : null;
  const doc = (
    <Document title="Wedding invitation" creator="One Tap Invites" producer="One Tap Invites">
      {part !== "envelope" && (o.eventLayout === "folded" ? <FoldedPages c={c} inv={inv} qr={qr} /> : (
        <>
          <Front c={c} inv={inv} />
          <Back c={c} inv={inv} qr={qr} />
        </>
      ))}
      {part !== "envelope" && inv.inserts.map((card) => <Insert key={card.event.id} c={c} card={card} />)}
      {part !== "card" && o.envelope !== "none" && <EnvelopePages c={c} inv={inv} />}
    </Document>
  );
  return renderToBuffer(doc);
}
