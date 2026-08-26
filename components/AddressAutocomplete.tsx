"use client";

import { useEffect, useRef } from "react";

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

export default function AddressAutocomplete({
  defaultValue,
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !inputRef.current) return;

    let autocomplete: google.maps.places.Autocomplete | undefined;
    let cancelled = false;

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current) return;
        autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          fields: ["formatted_address"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          if (place?.formatted_address && inputRef.current) {
            inputRef.current.value = place.formatted_address;
          }
        });
      })
      .catch(() => {
        // Autocomplete just won't be available; the field still works as a
        // plain text input, so there's nothing to surface to the user here.
      });

    return () => {
      cancelled = true;
      if (autocomplete) google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, []);

  return (
    <input
      ref={inputRef}
      name="address"
      autoComplete="off"
      defaultValue={defaultValue}
      className={className}
    />
  );
}
