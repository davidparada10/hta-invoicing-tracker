"use client";

// Server Actions that call revalidatePath("/") trigger Next's router to
// refresh the current route's RSC payload once the action resolves — and
// since neither the dashboard nor a project page wraps the affected table in
// its own Suspense boundary, the whole page's content gets swapped in,
// which resets scroll to the top. The refresh isn't synchronous with the
// action's own promise, so a single restore right after `await` isn't
// enough — reapply across a few frames to catch the late layout shift.
export async function withScrollPreserved<T>(action: () => Promise<T>): Promise<T> {
  const y = window.scrollY;
  let stop = false;
  // Only fight the specific "snapped to top" signature the refresh causes —
  // never fight a normal, gradual scroll the user makes during this window.
  const reassert = () => {
    if (stop) return;
    if (y > 0 && window.scrollY === 0) window.scrollTo({ top: y });
    requestAnimationFrame(reassert);
  };
  requestAnimationFrame(reassert);
  try {
    return await action();
  } finally {
    setTimeout(() => {
      stop = true;
    }, 1000);
  }
}
