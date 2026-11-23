"use client";

import { useEffect } from "react";
import "./globals.css";

/*
 * The last resort, when even the site's outer frame fails: it replaces the
 * whole page, so it brings its own <html> and keeps to plain markup.
 */
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error("[global error]", error.digest ?? "", error); }, [error]);
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-stone-50 p-6 font-sans">
        <title>Something went wrong · One Tap Invites</title>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200" role="alert">
          <p className="text-sm font-medium text-stone-500">One Tap Invites</p>
          <h1 className="mt-4 text-2xl text-stone-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-stone-600">The site couldn&rsquo;t load just now. Please try again in a moment.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" onClick={() => unstable_retry()} className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white">Try again</button>
            <a href="/" className="rounded-full border border-stone-300 px-5 py-2 text-sm font-medium text-stone-800">Home page</a>
          </div>
          {error.digest && <p className="mt-6 text-xs text-stone-400">Code {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
