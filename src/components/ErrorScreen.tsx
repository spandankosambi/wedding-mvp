"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/lib/core/brand";

/**
 * The one screen for "something went wrong" and "page not found": the brand,
 * a plain sentence, and a way on (try again, or home). `reference` is the
 * error's digest, matching the server log, for when someone writes to us.
 */
export function ErrorScreen({ title, message, onRetry, reference }: {
  title: string; message: string; onRetry?: () => void; reference?: string;
}) {
  return (
    <main className="portal-page flex min-h-screen items-center justify-center p-6">
      <div className="portal-panel w-full max-w-md p-7 text-center md:p-9" role="alert" data-testid="error-screen">
        <Link href="/" className="inline-block text-neutral-900" aria-label={`${BRAND} home`}><BrandLogo height={32} label={BRAND} /></Link>
        <h1 className="mt-6 font-serif text-2xl text-stone-900">{title}</h1>
        <p className="mt-2 text-sm text-stone-600">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">
              Try again
            </button>
          )}
          <Link href="/" className="rounded-full border border-stone-300 px-5 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50">
            Go to the home page
          </Link>
        </div>
        {reference && <p className="mt-6 text-xs text-stone-400">If this keeps happening, write to onetapinvites@gmail.com and mention code {reference}.</p>}
      </div>
    </main>
  );
}
