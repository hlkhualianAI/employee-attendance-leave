import { describe, expect, it } from "vitest";
import { isValidCoordinate, isWithinOfficeGeofence, OFFICE_LOCATION } from "./location.logic";

describe("office geofence", () => {
  it("allows the exact office coordinates", () => {
    expect(isWithinOfficeGeofence(OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude).allowed).toBe(true);
  });

  it("rejects a location far outside the office radius", () => {
    expect(isWithinOfficeGeofence(16.4005, 102.8603).allowed).toBe(false);
  });

  it("validates latitude and longitude ranges", () => {
    expect(isValidCoordinate(16.3, 102.8)).toBe(true);
    expect(isValidCoordinate(91, 102.8)).toBe(false);
    expect(isValidCoordinate(16.3, 181)).toBe(false);
  });
});
