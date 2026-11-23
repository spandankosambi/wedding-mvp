"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

/* Any page that fails: say so plainly, offer to try again. The details stay in the server log. */
export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error("[page error]", error.digest ?? "", error); }, [error]);
  return (
    <ErrorScreen
      title="Something went wrong"
      message="This page couldn't load just now. It's usually a brief hiccup — please try again."
      onRetry={() => unstable_retry()}
      reference={error.digest}
    />
  );
}
