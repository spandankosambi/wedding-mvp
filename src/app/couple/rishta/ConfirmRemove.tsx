"use client";

import { useState } from "react";

/** "Remove", then "Yes, remove" — so one stray tap never removes a profile. */
export function ConfirmRemove({ name }: { name: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="portal-button-secondary" onClick={() => setAsking(true)}>Remove</button>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-neutral-600">Hide {name} from everyone?</span>
      <button type="submit" className="portal-button-secondary">Yes, remove</button>
      <button type="button" className="portal-link text-sm" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}
