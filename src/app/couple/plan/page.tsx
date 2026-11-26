import { PlanScreen, type PlanParams } from "./PlanScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan", robots: { index: false, follow: false } };

/** The couple's Plan: tasks and meeting notes in all three spaces. */
export default async function CouplePlanPage({ searchParams }: { searchParams: Promise<PlanParams> }) {
  return <PlanScreen base="/couple/plan" sp={await searchParams} />;
}
