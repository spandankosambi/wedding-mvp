"use client";
import { createContext, useContext } from "react";
import { DEFAULT_SIDE_NAMES, type SideNames } from "@/lib/site/side-names";

/* The families' first names ("Pooja", "Spandan") for client pieces deep in a
   page — the guest-family form, the import review — without passing them
   through every layer in between. */
const Ctx = createContext<SideNames>(DEFAULT_SIDE_NAMES);

export function SideNamesProvider({ names, children }: { names: SideNames; children: React.ReactNode }) {
  return <Ctx.Provider value={names}>{children}</Ctx.Provider>;
}

export const useSideNames = () => useContext(Ctx);
