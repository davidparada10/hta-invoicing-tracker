import { describe, expect, it } from "vitest";
import { dashboardAddressLine, stripCountrySuffix } from "@/lib/address";

describe("stripCountrySuffix", () => {
  it("removes a trailing ', USA'", () => {
    expect(stripCountrySuffix("123 Main St, Van Nuys, CA 91401, USA")).toBe(
      "123 Main St, Van Nuys, CA 91401"
    );
  });

  it("removes a trailing ', United States' case-insensitively", () => {
    expect(stripCountrySuffix("123 Main St, Van Nuys, CA 91401, United States")).toBe(
      "123 Main St, Van Nuys, CA 91401"
    );
  });

  it("leaves an address with no country suffix untouched", () => {
    expect(stripCountrySuffix("123 Main St, Van Nuys, CA 91401")).toBe(
      "123 Main St, Van Nuys, CA 91401"
    );
  });
});

describe("dashboardAddressLine", () => {
  it("simplifies to city · zip when the project name already contains the street", () => {
    expect(
      dashboardAddressLine("123 Main St", "123 Main St, Van Nuys, CA 91401, USA")
    ).toBe("Van Nuys · 91401");
  });

  it("matches the street case-insensitively", () => {
    expect(
      dashboardAddressLine("123 MAIN ST — Phase 2", "123 Main St, Van Nuys, CA 91401, USA")
    ).toBe("Van Nuys · 91401");
  });

  it("falls back to the full address when the name doesn't contain the street", () => {
    expect(dashboardAddressLine("Cherokee", "123 Main St, Van Nuys, CA 91401, USA")).toBe(
      "123 Main St, Van Nuys, CA 91401"
    );
  });

  it("falls back to the full address when there's no parseable ZIP", () => {
    expect(
      dashboardAddressLine("123 Main St", "123 Main St, Van Nuys, CA, USA")
    ).toBe("123 Main St, Van Nuys, CA");
  });

  it("falls back to the full address when there aren't enough comma segments to parse", () => {
    expect(dashboardAddressLine("123 Main St", "Van Nuys, CA")).toBe("Van Nuys, CA");
  });

  it("returns null with no address", () => {
    expect(dashboardAddressLine("123 Main St", null)).toBeNull();
    expect(dashboardAddressLine("123 Main St", undefined)).toBeNull();
  });

  it("supports a 9-digit ZIP", () => {
    expect(
      dashboardAddressLine("123 Main St", "123 Main St, Van Nuys, CA 91401-1234, USA")
    ).toBe("Van Nuys · 91401");
  });
});
