import type { PlaceCategory, RankedPlace } from './ranking';

const rawEnvAdmin =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_ADMIN_EMAIL
    ? (import.meta as { env?: Record<string, string | undefined> }).env!.VITE_ADMIN_EMAIL
    : undefined;

export const ADMIN_EMAIL = (rawEnvAdmin || 'atakowiecvr25@gmail.com')
  .trim()
  .toLowerCase();

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  totalReviews: number;
  reviews24h: number;
  reviews7d: number;
  totalPlaces: number;
  communityPlacesCount: number;
}

export interface AdminUserEntry {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  createdAt: string;
  lastSignInAt: string | null;
  lastIp?: string;
  lastUserAgent?: string;
  reviewsCount: number;
  placesAddedCount: number;
}

export interface AdminReviewEntry {
  id: string;
  placeId: string;
  placeName: string;
  placeCategory: PlaceCategory;
  userId: string;
  authorName: string;
  userEmail: string;
  userGoogleName: string;
  rating: number;
  comment: string;
  isLocalVerified: boolean;
  distanceKm: number;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
}

export interface AdminCommunityPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  creatorEmail: string;
  creatorName: string;
  createdAt: string;
}

export interface AdminDashboardData {
  stats: AdminStats;
  users: AdminUserEntry[];
  recentReviews: AdminReviewEntry[];
  communityPlaces: AdminCommunityPlace[];
}

export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return 'brak danych';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'brak danych';
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDevice(userAgent?: string | null): string {
  if (!userAgent) return '';
  const ua = userAgent.toLowerCase();
  const os = ua.includes('iphone') || ua.includes('ipad')
    ? 'iOS'
    : ua.includes('android')
      ? 'Android'
      : ua.includes('windows')
        ? 'Windows'
        : ua.includes('mac os') || ua.includes('macintosh')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Inny system';
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('chrome/') || ua.includes('crios/')
        ? 'Chrome'
        : ua.includes('firefox/') || ua.includes('fxios/')
          ? 'Firefox'
          : ua.includes('safari/')
            ? 'Safari'
            : 'Przeglądarka';
  return `${browser} · ${os}`;
}

/**
 * Buduje awaryjny widok statystyk wyłącznie na podstawie załadowanych lokali i opinii
 * (używane w trybie lokalnym lub zanim zostanie uruchomiony skrypt admin_setup.sql w Supabase).
 */
export function buildFallbackAdminDashboard(
  places: RankedPlace[],
  nowMs: number = Date.now()
): AdminDashboardData {
  const cutoff24h = nowMs - 24 * 60 * 60 * 1000;
  const cutoff7d = nowMs - 7 * 24 * 60 * 60 * 1000;

  const recentReviews: AdminReviewEntry[] = [];
  const userMap = new Map<string, AdminUserEntry>();
  const communityPlaces: AdminCommunityPlace[] = [];

  let reviews24h = 0;
  let reviews7d = 0;

  for (const place of places) {
    if (place.createdBy) {
      communityPlaces.push({
        id: place.id,
        name: place.name,
        category: place.category,
        address: place.address,
        creatorEmail: '',
        creatorName: place.createdBy,
        createdAt: place.createdAt,
      });

      const existingCreator = userMap.get(place.createdBy);
      if (existingCreator) {
        existingCreator.placesAddedCount += 1;
      } else {
        userMap.set(place.createdBy, {
          id: place.createdBy,
          email: '',
          fullName: 'Autor zgłoszenia',
          avatarUrl: '',
          createdAt: place.createdAt,
          lastSignInAt: place.createdAt,
          reviewsCount: 0,
          placesAddedCount: 1,
        });
      }
    }

    for (const r of place.reviews) {
      const updated = r.updatedAt || r.createdAt;
      const createdMs = new Date(r.createdAt).getTime();
      const updatedMs = new Date(updated).getTime();
      const activityMs = Math.max(createdMs, updatedMs);
      const isEdited = updatedMs - createdMs > 2000;

      if (activityMs >= cutoff24h) reviews24h += 1;
      if (activityMs >= cutoff7d) reviews7d += 1;

      recentReviews.push({
        id: r.id,
        placeId: place.id,
        placeName: place.name,
        placeCategory: place.category,
        userId: r.userId,
        authorName: r.authorName,
        userEmail: '',
        userGoogleName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        isLocalVerified: r.isLocalVerified,
        distanceKm: r.distanceKm,
        createdAt: r.createdAt,
        updatedAt: updated,
        isEdited,
      });

      const existingUser = userMap.get(r.userId);
      if (existingUser) {
        existingUser.reviewsCount += 1;
        if (
          r.authorName &&
          r.authorName !== 'Anonimowy mieszkaniec' &&
          existingUser.fullName === 'Anonimowy mieszkaniec'
        ) {
          existingUser.fullName = r.authorName;
        }
        if (
          !existingUser.lastSignInAt ||
          activityMs > new Date(existingUser.lastSignInAt).getTime()
        ) {
          existingUser.lastSignInAt = new Date(activityMs).toISOString();
        }
      } else {
        userMap.set(r.userId, {
          id: r.userId,
          email: '',
          fullName: r.authorName || 'Mieszkaniec Knurowa',
          avatarUrl: r.authorAvatar || '',
          createdAt: r.createdAt,
          lastSignInAt: new Date(activityMs).toISOString(),
          reviewsCount: 1,
          placesAddedCount: 0,
        });
      }
    }
  }

  recentReviews.sort((a, b) => {
    const aMs = Math.max(
      new Date(a.createdAt).getTime(),
      new Date(a.updatedAt).getTime()
    );
    const bMs = Math.max(
      new Date(b.createdAt).getTime(),
      new Date(b.updatedAt).getTime()
    );
    return bMs - aMs;
  });

  communityPlaces.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const users = Array.from(userMap.values()).sort((a, b) => {
    const aMs = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0;
    const bMs = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0;
    return bMs - aMs;
  });

  const activeUsers24h = users.filter(
    (u) => u.lastSignInAt && new Date(u.lastSignInAt).getTime() >= cutoff24h
  ).length;
  const activeUsers7d = users.filter(
    (u) => u.lastSignInAt && new Date(u.lastSignInAt).getTime() >= cutoff7d
  ).length;

  return {
    stats: {
      totalUsers: users.length,
      activeUsers24h,
      activeUsers7d,
      totalReviews: recentReviews.length,
      reviews24h,
      reviews7d,
      totalPlaces: places.length,
      communityPlacesCount: communityPlaces.length,
    },
    users,
    recentReviews: recentReviews.slice(0, 40),
    communityPlaces: communityPlaces.slice(0, 50),
  };
}
