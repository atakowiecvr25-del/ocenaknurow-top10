import fs from 'node:fs';
import path from 'node:path';
import {
  calculateGlobalMean,
  checkUserRateLimit,
  rankPlaces,
  type Place,
  type PlaceCategory,
  type RankedPlace,
  type Review,
} from '../lib/ranking';
import { SEED_PLACES, SEED_REVIEWS } from './seedData';

export interface DbState {
  places: Place[];
  reviews: Review[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'knurow-db.json');

function ensureDataFile(): DbState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: DbState = {
      places: SEED_PLACES,
      reviews: SEED_REVIEWS,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DbState;
    if (!Array.isArray(parsed.places) || !Array.isArray(parsed.reviews)) {
      throw new Error('Invalid DB structure');
    }
    return parsed;
  } catch {
    const fallback: DbState = {
      places: SEED_PLACES,
      reviews: SEED_REVIEWS,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

function saveDb(state: DbState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function getRankedSnapshot(): {
  places: RankedPlace[];
  globalMeanC: number;
  totalReviews: number;
} {
  const db = ensureDataFile();
  return {
    places: rankPlaces(db.places, db.reviews),
    globalMeanC: calculateGlobalMean(db.reviews),
    totalReviews: db.reviews.length,
  };
}

export function getUserRateLimitStatus(userId: string) {
  const db = ensureDataFile();
  return checkUserRateLimit(db.reviews, userId);
}

export function upsertReview(input: {
  placeId: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  rating: number;
  comment: string;
  isLocalVerified: boolean;
  distanceKm: number;
}): {
  review: Review;
  action: 'inserted' | 'updated';
} {
  const db = ensureDataFile();
  const placeExists = db.places.some((p) => p.id === input.placeId);
  if (!placeExists) {
    throw new Error('PLACE_NOT_FOUND');
  }

  const existingIdx = db.reviews.findIndex(
    (r) => r.placeId === input.placeId && r.userId === input.userId
  );

  const nowIso = new Date().toISOString();

  if (existingIdx !== -1) {
    const existing = db.reviews[existingIdx];
    const updated: Review = {
      ...existing,
      authorName: input.authorName,
      authorAvatar: input.authorAvatar,
      rating: input.rating,
      comment: input.comment.trim(),
      isLocalVerified: input.isLocalVerified,
      distanceKm: input.distanceKm,
      updatedAt: nowIso,
    };
    db.reviews[existingIdx] = updated;
    saveDb(db);
    return { review: updated, action: 'updated' };
  }

  const rateLimit = checkUserRateLimit(db.reviews, input.userId);
  if (!rateLimit.allowed) {
    throw new Error('RATE_LIMIT_EXCEEDED');
  }

  const created: Review = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    placeId: input.placeId,
    userId: input.userId,
    authorName: input.authorName,
    authorAvatar: input.authorAvatar,
    rating: input.rating,
    comment: input.comment.trim(),
    isLocalVerified: input.isLocalVerified,
    distanceKm: input.distanceKm,
    createdAt: nowIso,
  };

  db.reviews.unshift(created);
  saveDb(db);
  return { review: created, action: 'inserted' };
}

export function deleteReview(placeId: string, userId: string): boolean {
  const db = ensureDataFile();
  const initialLen = db.reviews.length;
  db.reviews = db.reviews.filter(
    (r) => !(r.placeId === placeId && r.userId === userId)
  );
  if (db.reviews.length === initialLen) {
    return false;
  }
  saveDb(db);
  return true;
}

export function addPlace(input: {
  name: string;
  category: PlaceCategory;
  address: string;
  tags: string[];
  lat: number;
  lng: number;
  createdBy: string;
}): Place {
  const db = ensureDataFile();
  const duplicate = db.places.find(
    (p) =>
      p.name.trim().toLowerCase() === input.name.trim().toLowerCase() &&
      p.address.trim().toLowerCase() === input.address.trim().toLowerCase()
  );
  if (duplicate) {
    throw new Error('DUPLICATE_PLACE');
  }

  const newPlace: Place = {
    id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    category: input.category,
    address: input.address.trim(),
    tags: input.tags.slice(0, 5),
    lat: input.lat,
    lng: input.lng,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };

  db.places.push(newPlace);
  saveDb(db);
  return newPlace;
}
