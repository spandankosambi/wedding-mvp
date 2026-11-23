import { ErrorScreen } from "@/components/ErrorScreen";

export const metadata = { title: "Page not found" };

/* An address that doesn't exist, or a wedding page that's been taken down. */
export default function NotFound() {
  return (
    <ErrorScreen
      title="We couldn't find that page"
      message="The link may be mistyped or out of date. If someone sent it to you, ask them for a fresh one."
    />
  );
}
