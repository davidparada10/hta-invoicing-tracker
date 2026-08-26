"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
    __googleMapsLoadingPromise?: Promise<void>;
  }
}

const SCRIPT_ID = "google-maps-places-script";

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__googleMapsLoadingPromise) return window.__googleMapsLoadingPromise;

  window.__googleMapsLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps script.")));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script."));
    document.head.appendChild(script);
  });

  return window.__googleMapsLoadingPromise;
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

    loadGoogleMapsScript(apiKey)
      .then(async () => {
        if (cancelled) return;
        await google.maps.importLibrary("places");
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
