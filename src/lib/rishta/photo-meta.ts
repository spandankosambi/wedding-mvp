/*
 * Removes hidden data from a photo (where it was taken, the camera, dates,
 * comments) without re-drawing it, so no new image library is needed.
 * Photos are also re-drawn in the browser before upload, which removes the
 * same data; this is the server's own check, for anything sent another way.
 *
 * JPEG: drops APP1–APP15 segments (EXIF, XMP, IPTC…) and comments; keeps
 *       APP0 (JFIF) and everything needed to show the picture.
 * PNG:  drops eXIf, tEXt, zTXt, iTXt and tIME chunks.
 * WebP: drops EXIF and XMP chunks and clears their flags in the VP8X header.
 * Returns null for anything that isn't a well-formed JPEG, PNG or WebP.
 */

export type PhotoKind = "jpeg" | "png" | "webp";

function photoKind(b: Uint8Array): PhotoKind | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return null;
}

export function stripPhotoMetadata(b: Uint8Array): { kind: PhotoKind; bytes: Uint8Array } | null {
  const kind = photoKind(b);
  if (!kind) return null;
  const bytes = kind === "jpeg" ? jpeg(b) : kind === "png" ? png(b) : webp(b);
  return bytes ? { kind, bytes } : null;
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function jpeg(b: Uint8Array): Uint8Array | null {
  const keep: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xda) { keep.push(b.subarray(i)); return concat(keep); } // start of scan: the picture itself, to the end
    if (marker === 0xd9) { keep.push(b.subarray(i, i + 2)); return concat(keep); }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) keep.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

function png(b: Uint8Array): Uint8Array | null {
  const DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
  const keep: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (!DROP.has(type)) keep.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(keep);
  }
  return null;
}

function webp(b: Uint8Array): Uint8Array | null {
  const keep: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
    const end = i + 8 + len + (len % 2); // chunks are padded to an even length
    if (len < 0 || end > b.length + 1) return null;
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04); // no EXIF, no XMP
      keep.push(chunk);
    }
    i = end;
  }
  const body = concat(keep);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  const size = body.length + 4;
  head[4] = size & 0xff; head[5] = (size >> 8) & 0xff; head[6] = (size >> 16) & 0xff; head[7] = (size >> 24) & 0xff;
  return concat([head, body]);
}
