/** A form field's label, an optional hint beside it, and the input under it. */
export const Field = ({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <label className={`block ${className}`}>
    <span className="text-xs font-medium text-neutral-600">{label}</span>
    {hint && <span className="ml-2 text-xs text-neutral-400">{hint}</span>}
    <div className="mt-1.5">{children}</div>
  </label>
);
