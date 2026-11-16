import { SectionHeader } from "./SectionHeader";

/** Short notes from the family: parking, weather, what to wear… */
export function ThingsToKnow({ items, no }: { items: { title: string; text: string }[]; no: string }) {
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32" data-testid="things-to-know">
      <SectionHeader no={no} title="Things to know" />
      <ul className="know-grid">
        {items.map((k, i) => (
          <li key={i} className="reveal know-card" data-fx="scale" style={{ "--rd": `${(i % 3) * 0.1}s` } as React.CSSProperties}>
            <span aria-hidden className="know-mark" />
            <h3 className="font-display text-2xl tracking-tight">{k.title}</h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{k.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
