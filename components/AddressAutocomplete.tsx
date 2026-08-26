"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
    __googleMapsBootstrapped?: boolean;
  }
}

// A plain `<script src="...loading=async">` tag's `onload` event fires once
// the file has downloaded and executed, but `google.maps.importLibrary` can
// still take a moment longer to become callable after that — calling it too
// early throws "google.maps.importLibrary is not a function". Google's own
// inline bootstrap loader (reproduced here) avoids that race: `importLibrary`
// itself queues the request and returns a promise that only resolves once
// the library is truly ready, regardless of when it's first called.
function ensureGoogleMapsBootstrap(apiKey: string): void {
  if (window.__googleMapsBootstrapped) return;
  window.__googleMapsBootstrapped = true;

  (
    g => {
      let h: Promise<void>, a: HTMLScriptElement, k: string;
      const p = "The Google Maps JavaScript API",
        c = "google",
        l = "importLibrary",
        q = "__ib__",
        m = document;
      // Faithful port of Google's own untyped bootstrap snippet — not worth
      // fighting the type system over.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let b = window as any;
      b = b[c] || (b[c] = {});
      const d = b.maps || (b.maps = {});
      const r = new Set<string>();
      const e = new URLSearchParams();
      const u = () =>
        h ||
        (h = new Promise(async (f, n) => {
          a = m.createElement("script");
          e.set("libraries", Array.from(r) + "");
          for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), (g as Record<string, string>)[k]);

          e.set("callback", c + ".maps." + q);
          a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
          d[q] = f;
          a.onerror = () => (h = n(Error(p + " could not load.")) as unknown as Promise<void>);
          a.nonce = m.querySelector("script[nonce]")?.getAttribute("nonce") || "";
          m.head.append(a);
        }));
      if (d[l]) {
        console.warn(p + " only loads once. Ignoring:", g);
      } else {
        d[l] = (f: string, ...n: unknown[]) => r.add(f) && u().then(() => d[l](f, ...n));
      }
    }
  )({ key: apiKey, v: "weekly" });
}

// Google retired the classic `google.maps.places.Autocomplete` widget for
// any project created after March 1, 2025 — it now throws
// "not available to new customers" and never shows a dropdown. The
// replacement is the `PlaceAutocompleteElement` custom element, which
// manages its own internal input rather than binding to a plain <input>.
export default function AddressAutocomplete({
  defaultValue,
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const container = containerRef.current;
    if (!apiKey || !container) return;

    let cancelled = false;
    let element: HTMLElement & { value?: string };

    ensureGoogleMapsBootstrap(apiKey);

    google.maps
      .importLibrary("places")
      .then(async () => {
        if (cancelled) return;

        const PlaceAutocompleteElement = (google.maps.places as unknown as {
          PlaceAutocompleteElement: new (opts?: { includedPrimaryTypes?: string[] }) => HTMLElement & {
            value?: string;
          };
        }).PlaceAutocompleteElement;

        element = new PlaceAutocompleteElement({
          includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        });
        element.classList.add("place-autocomplete-input");
        element.style.width = "100%";
        if (defaultValue) {
          try {
            element.value = defaultValue;
          } catch {
            // Prefilling isn't guaranteed to be supported; not critical.
          }
        }

        container.appendChild(element);

        element.addEventListener("gmp-select", async (event: Event) => {
          const prediction = (event as unknown as {
            placePrediction: {
              toPlace: () => {
                fetchFields: (opts: { fields: string[] }) => Promise<void>;
                formattedAddress?: string;
              };
            };
          }).placePrediction;
          const place = prediction.toPlace();
          await place.fetchFields({ fields: ["formattedAddress"] });
          if (!cancelled) setValue(place.formattedAddress ?? "");
        });

        // Best-effort: keep manual (non-selected) typing in sync too.
        element.addEventListener("input", (event: Event) => {
          const target = event.target as HTMLInputElement | null;
          if (target && typeof target.value === "string") setValue(target.value);
        });
      })
      .catch(() => {
        // Autocomplete just won't be available; the fallback plain input
        // below still works, so there's nothing to surface to the user.
      });

    return () => {
      cancelled = true;
      if (element && container.contains(element)) {
        container.removeChild(element);
      }
    };
  }, [defaultValue]);

  return (
    <div>
      <div ref={containerRef} className={className} />
      <input type="hidden" name="address" value={value} />
      <noscript>
        <input name="address" defaultValue={defaultValue} className={className} />
      </noscript>
    </div>
  );
}
