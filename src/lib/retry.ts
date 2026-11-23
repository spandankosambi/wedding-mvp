/**
 * Run `fn`, trying again after a short wait when it fails: for brief network
 * hiccups (the database or an outside service waking up). Waits grow:
 * 0.5 s, 1.5 s, 4.5 s… The last failure is passed on.
 */
export async function withRetry<T>(fn: () => Promise<T>, { tries = 3, firstWaitMs = 500, label = "task" } = {}): Promise<T> {
  let wait = firstWaitMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= tries) throw e;
      console.warn(`[retry] ${label} failed (try ${attempt} of ${tries}), again in ${wait} ms:`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, wait));
      wait *= 3;
    }
  }
}
