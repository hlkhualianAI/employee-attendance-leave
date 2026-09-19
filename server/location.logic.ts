export const OFFICE_LOCATION = {
  latitude: 16.3974363,
  longitude: 102.8603072,
  radiusMeters: 150,
} as const;

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinOfficeGeofence(latitude: number, longitude: number, radiusMeters = OFFICE_LOCATION.radiusMeters) {
  const distanceMeters = calculateDistanceMeters(
    { latitude, longitude },
    { latitude: OFFICE_LOCATION.latitude, longitude: OFFICE_LOCATION.longitude },
  );
  return { allowed: distanceMeters <= radiusMeters, distanceMeters };
}

export function isValidCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}
