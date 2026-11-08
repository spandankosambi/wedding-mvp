import type { GalleryPhoto } from "@/db/schema";
import { SectionHeader } from "./SectionHeader";

const PLATES = [
  { src: "/gallery/marigold-garland.svg", alt: "Marigold garland illustration", tall: true },
  { src: "/gallery/paisley.svg", alt: "Paisley motif illustration", tall: false },
  { src: "/gallery/mandap.svg", alt: "Mandap arch illustration", tall: true },
  { src: "/gallery/jhumka.svg", alt: "Jhumka earring illustration", tall: true },
  { src: "/gallery/mandala.svg", alt: "Mandala dot-work illustration", tall: false },
  { src: "/gallery/lotus.svg", alt: "Lotus illustration", tall: true },
];

/** The couple's photos when they've added some; until then, illustrated
    plates in the theme's palette so the section never looks empty. */
export function Gallery({ theme: _theme, no = "04", photos = [] }: { theme: string; no?: string; photos?: GalleryPhoto[] }) {
  const own = photos.length > 0;
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
      <SectionHeader no={no} title="Gallery" />
      <div className="columns-2 gap-4 md:columns-3 md:gap-6 [&>div]:mb-4 md:[&>div]:mb-6">
        {own
          ? photos.map((p, i) => (
              <div
                key={p.pathname}
                className="reveal plate break-inside-avoid"
                data-fx="scale"
                style={{ "--rd": `${(i % 3) * 0.1}s` } as React.CSSProperties}
              >
                <img src={p.url} alt="" width={p.width} height={p.height} loading="lazy" className="h-auto w-full" />
              </div>
            ))
          : PLATES.map((p, i) => (
              <div
                key={p.src}
                className="reveal plate break-inside-avoid"
                data-fx="scale"
                style={{ "--rd": `${(i % 3) * 0.1}s` } as React.CSSProperties}
              >
                <img
                  src={p.src}
                  alt={p.alt}
                  width={600}
                  height={p.tall ? 780 : 600}
                  loading="lazy"
                  className="w-full"
                />
              </div>
            ))}
      </div>
      {!own && <p className="reveal kicker mt-8 text-center">Photographs arrive after the haldi</p>}
    </section>
  );
}
