import zlib from "node:zlib";
import { ICON_PX, isIconMask } from "./icon-mask";

/* a small PNG writer: the mask as an image in one colour (server only) */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

/** The mask as a PNG data URL, in `hex` (e.g. "#d4a439"); null if it isn't a mask. */
export function iconPng(mask: string | null | undefined, hex = "#ffffff"): string | null {
  if (!mask || !isIconMask(mask)) return null;
  const alpha = Buffer.from(mask, "base64");
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  const raw = Buffer.alloc(ICON_PX * (1 + ICON_PX * 4));
  for (let y = 0; y < ICON_PX; y++) {
    const row = y * (1 + ICON_PX * 4);
    for (let x = 0; x < ICON_PX; x++) {
      const o = row + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = alpha[y * ICON_PX + x];
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(ICON_PX, 0); head.writeUInt32BE(ICON_PX, 4);
  head[8] = 8; head[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
