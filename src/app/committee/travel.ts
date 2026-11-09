"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setTravelAction } from "./actions";

type Family = { id: string; name: string; showTravel: boolean };

/**
 * The Travel & Stay tick, shared by the Families and Guests views. It's one
 * value per household, so in the Guests view ticking one guest ticks (or
 * unticks) everyone in their family at once — shown straight away, then saved.
 */
export function useTravelToggle(weddingId: string, rows: readonly unknown[], flash: (msg: string) => void) {
  const router = useRouter();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // fresh data from the server replaces any choice still on screen
  useEffect(() => { setPending({}); }, [rows]);

  return {
    shows: (f: Family) => pending[f.id] ?? f.showTravel,
    set: async (f: Family, show: boolean) => {
      setPending((p) => ({ ...p, [f.id]: show }));
      const res = await setTravelAction({ weddingId, familyId: f.id, show });
      if (res.ok) {
        flash(`Travel & Stay ${show ? "shown to" : "hidden from"} ${f.name}`);
        router.refresh();
      } else {
        setPending((p) => { const n = { ...p }; delete n[f.id]; return n; });
        flash(`Couldn't save Travel & Stay for ${f.name}: ${res.error ?? "failed"}`);
      }
    },
  };
}
