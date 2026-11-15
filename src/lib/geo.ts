export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Centrum Knurowa (okolice Rynku / ul. Niepodległości, woj. śląskie)
 */
export const KNUROW_CENTER: Coordinates = {
  lat: 50.2225,
  lng: 18.6708,
};

/**
 * Maksymalny promień weryfikacji lokalnej obejmujący Knurów, Szczygłowice,
 * Gierałtowice oraz Pilchowice.
 */
export const MAX_VERIFIED_DISTANCE_KM = 10;

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Oblicza odległość w linii prostej (w kilometrach) pomiędzy dwoma punktami
 * na powierzchni Ziemi za pomocą wzoru Haversine'a.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    throw new Error('Nieprawidłowe współrzędne geograficzne.');
  }

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
}

export interface LocationVerificationResult {
  distanceKm: number;
  isLocalVerified: boolean;
  zoneLabel: string;
}

/**
 * Sprawdza, czy użytkownik znajduje się w promieniu 10 km od centrum Knurowa.
 */
export function verifyKnurowLocation(
  lat: number,
  lng: number
): LocationVerificationResult {
  const distanceKm = calculateHaversineDistanceKm(
    lat,
    lng,
    KNUROW_CENTER.lat,
    KNUROW_CENTER.lng
  );
  const isLocalVerified = distanceKm <= MAX_VERIFIED_DISTANCE_KM;

  let zoneLabel = 'Poza strefą Knurowa (> 10 km)';
  if (distanceKm <= 3.5) {
    zoneLabel = 'Knurów – Centrum / Wojska Polskiego';
  } else if (distanceKm <= 6.5) {
    zoneLabel = 'Knurów / Szczygłowice';
  } else if (isLocalVerified) {
    zoneLabel = 'Gmina Knurów / Gierałtowice / Pilchowice';
  }

  return {
    distanceKm,
    isLocalVerified,
    zoneLabel,
  };
}
