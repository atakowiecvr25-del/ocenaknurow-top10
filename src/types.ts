import type { PlaceCategory, RankedPlace, Review } from './lib/ranking';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  provider: 'google';
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  countLast24h: number;
  resetAtIso: string | null;
}

export interface MapGroundingSource {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets?: string[];
}

export interface MapsGroundingResponse {
  answer: string;
  sources: MapGroundingSource[];
}

export interface GpsState {
  status: 'idle' | 'locating' | 'verified' | 'rejected' | 'error';
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  zoneLabel: string | null;
  errorMessage: string | null;
}

export type ActiveNavSection = 'ranking' | 'gps' | 'maps' | 'sql';

export type { PlaceCategory, RankedPlace, Review };
