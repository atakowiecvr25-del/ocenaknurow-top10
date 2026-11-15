export type PlaceCategory =
  | 'kebab'
  | 'barber'
  | 'fryzjer'
  | 'zabka'
  | 'lidl'
  | 'biedronka'
  | 'szkoly'
  | 'pizzeria'
  | 'silownie'
  | 'boiska'
  | 'inne';

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  tags: string[];
  lat: number;
  lng: number;
  createdAt: string;
  createdBy?: string | null;
}

export interface Review {
  id: string;
  placeId: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  rating: number;
  comment: string;
  isLocalVerified: boolean;
  distanceKm: number;
  createdAt: string;
  updatedAt?: string;
}

export interface RankedPlace extends Place {
  rank: number;
  bayesScore: number;
  rawAverage: number | null;
  totalVotes: number;
  verifiedVotes: number;
  isProvisional: boolean;
  ratingDistribution: number[];
  reviews: Review[];
}

export const BAYES_MINIMUM_VOTES_M = 10;
export const DEFAULT_GLOBAL_MEAN_C = 7.0;
export const MAX_REVIEWS_PER_24H = 3;
export const MAX_COMMENT_LENGTH = 400;
export const ANONYMOUS_AUTHOR_NAME = 'Anonimowy mieszkaniec';

export function resolveReviewAuthor(
  authorName: string,
  authorAvatar: string,
  options?: { hideName?: boolean; hideAvatar?: boolean }
): {
  authorName: string;
  authorAvatar: string;
  isNameHidden: boolean;
  isAvatarHidden: boolean;
} {
  const hideName = Boolean(options?.hideName);
  const hideAvatar = Boolean(options?.hideAvatar);
  const resolvedName = hideName
    ? ANONYMOUS_AUTHOR_NAME
    : authorName.trim() || 'Mieszkaniec Knurowa';
  const resolvedAvatar = hideAvatar ? '' : authorAvatar;

  return {
    authorName: resolvedName,
    authorAvatar: resolvedAvatar,
    isNameHidden: resolvedName === ANONYMOUS_AUTHOR_NAME,
    isAvatarHidden: resolvedAvatar === '',
  };
}

export const CATEGORY_LABELS: Record<PlaceCategory | 'wszystkie', string> = {
  wszystkie: 'Wszystkie',
  kebab: 'Kebab',
  barber: 'Barbershop',
  fryzjer: 'Fryzjer',
  zabka: 'Żabka',
  lidl: 'Lidl',
  biedronka: 'Biedronka',
  szkoly: 'Szkoły',
  pizzeria: 'Pizzerie',
  silownie: 'Siłownie',
  boiska: 'Boiska / Orliki',
  inne: 'Inne',
};

export const VALID_CATEGORIES: PlaceCategory[] = [
  'kebab',
  'barber',
  'fryzjer',
  'zabka',
  'lidl',
  'biedronka',
  'szkoly',
  'pizzeria',
  'silownie',
  'boiska',
  'inne',
];

/**
 * Normalizuje starsze kategorie (np. 'sklepy') do nowych rozdzielonych kategorii.
 */
export function normalizePlaceCategory(
  rawCategory: string,
  placeName: string = ''
): PlaceCategory {
  if (VALID_CATEGORIES.includes(rawCategory as PlaceCategory)) {
    return rawCategory as PlaceCategory;
  }
  const lower = placeName.toLowerCase();
  if (lower.includes('żabka') || lower.includes('zabka')) return 'zabka';
  if (lower.includes('lidl')) return 'lidl';
  if (lower.includes('biedronka')) return 'biedronka';
  if (lower.includes('fryzjer')) return 'fryzjer';
  if (lower.includes('barber')) return 'barber';
  if (lower.includes('kebab')) return 'kebab';
  if (lower.includes('pizz')) return 'pizzeria';
  if (
    lower.includes('siłownia') ||
    lower.includes('silownia') ||
    lower.includes('fitness') ||
    lower.includes('health lab') ||
    lower.includes('one step') ||
    lower.includes('spartan') ||
    lower.includes('uniwersytet siły')
  ) {
    return 'silownie';
  }
  if (
    lower.includes('orlik') ||
    lower.includes('boisko') ||
    lower.includes('stadion') ||
    lower.includes('kort')
  ) {
    return 'boiska';
  }
  if (lower.includes('szkoł') || lower.includes('liceum') || lower.includes('msp')) {
    return 'szkoly';
  }
  return 'inne';
}

/**
 * Oblicza globalną średnią C wszystkich ocen w systemie (domyślnie 7.0 przy braku głosów).
 */
export function calculateGlobalMean(
  reviews: Pick<Review, 'rating' | 'isLocalVerified'>[]
): number {
  const verified = reviews.filter((r) => r.isLocalVerified);
  const pool = verified.length > 0 ? verified : reviews;
  if (pool.length === 0) {
    return DEFAULT_GLOBAL_MEAN_C;
  }
  const sum = pool.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / pool.length) * 1000) / 1000;
}

/**
 * Oblicza wynik średniej ważonej Bayesa:
 * WR = (v / (v + m)) * R + (m / (v + m)) * C
 */
export function calculateBayesScore(
  averageR: number,
  voteCountV: number,
  globalMeanC: number,
  minimumVotesM: number = BAYES_MINIMUM_VOTES_M
): number {
  if (voteCountV <= 0) {
    return Math.round(globalMeanC * 100) / 100;
  }
  const weighted =
    (voteCountV / (voteCountV + minimumVotesM)) * averageR +
    (minimumVotesM / (voteCountV + minimumVotesM)) * globalMeanC;
  return Math.round(weighted * 100) / 100;
}

/**
 * Zwraca 10-elementową tablicę rozkładu ocen od 1 do 10.
 */
export function buildRatingDistribution(
  reviews: Pick<Review, 'rating'>[]
): number[] {
  const buckets = new Array<number>(10).fill(0);
  for (const review of reviews) {
    const idx = Math.round(review.rating) - 1;
    if (idx >= 0 && idx < 10) {
      buckets[idx] += 1;
    }
  }
  return buckets;
}

/**
 * Buduje ranking lokali posortowany malejąco po wyniku Bayesa.
 * Opinie spoza strefy Knurowa (jeśli kiedykolwiek wystąpią) mają obniżoną wagę 0.35.
 */
export function rankPlaces(
  places: Place[],
  reviews: Review[],
  minimumVotesM: number = BAYES_MINIMUM_VOTES_M
): RankedPlace[] {
  const globalMeanC = calculateGlobalMean(reviews);

  const reviewsByPlace = new Map<string, Review[]>();
  for (const rev of reviews) {
    const existing = reviewsByPlace.get(rev.placeId);
    if (existing) {
      existing.push(rev);
    } else {
      reviewsByPlace.set(rev.placeId, [rev]);
    }
  }

  const scored = places.map((place) => {
    const placeReviews = [...(reviewsByPlace.get(place.id) ?? [])].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const verifiedReviews = placeReviews.filter((r) => r.isLocalVerified);
    const totalVotes = placeReviews.length;
    const verifiedVotes = verifiedReviews.length;

    let effectiveSum = 0;
    let effectiveCount = 0;
    for (const r of placeReviews) {
      const weight = r.isLocalVerified ? 1.0 : 0.35;
      effectiveSum += r.rating * weight;
      effectiveCount += weight;
    }

    const rawAverage =
      effectiveCount > 0
        ? Math.round((effectiveSum / effectiveCount) * 100) / 100
        : null;

    const bayesScore =
      rawAverage !== null
        ? calculateBayesScore(
            rawAverage,
            effectiveCount,
            globalMeanC,
            minimumVotesM
          )
        : Math.round(globalMeanC * 100) / 100;

    return {
      ...place,
      rank: 0,
      bayesScore,
      rawAverage,
      totalVotes,
      verifiedVotes,
      isProvisional: verifiedVotes < minimumVotesM,
      ratingDistribution: buildRatingDistribution(placeReviews),
      reviews: placeReviews,
    };
  });

  scored.sort((a, b) => {
    if (b.bayesScore !== a.bayesScore) {
      return b.bayesScore - a.bayesScore;
    }
    if (b.verifiedVotes !== a.verifiedVotes) {
      return b.verifiedVotes - a.verifiedVotes;
    }
    return a.name.localeCompare(b.name, 'pl');
  });

  return scored.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  countLast24h: number;
  resetAtIso: string | null;
}

/**
 * Egzekwuje limit maksymalnie 3 nowych opinii na jedno konto Google w ciągu 24 godzin.
 */
export function checkUserRateLimit(
  reviews: Review[],
  userId: string,
  nowMs: number = Date.now()
): RateLimitStatus {
  const windowStartMs = nowMs - 24 * 60 * 60 * 1000;
  const recent = reviews
    .filter((r) => {
      if (r.userId !== userId) return false;
      const createdMs = new Date(r.createdAt).getTime();
      return createdMs >= windowStartMs && createdMs <= nowMs;
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  const countLast24h = recent.length;
  const remaining = Math.max(0, MAX_REVIEWS_PER_24H - countLast24h);
  const allowed = countLast24h < MAX_REVIEWS_PER_24H;
  const oldestRecent = recent[0];
  const resetAtIso =
    !allowed && oldestRecent
      ? new Date(
          new Date(oldestRecent.createdAt).getTime() + 24 * 60 * 60 * 1000
        ).toISOString()
      : null;

  return {
    allowed,
    remaining,
    countLast24h,
    resetAtIso,
  };
}

export function validateReviewInput(
  rating: number,
  comment: string
): { valid: boolean; error?: string } {
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return {
      valid: false,
      error: 'Ocena musi być liczbą całkowitą w skali od 1 do 10.',
    };
  }
  const trimmed = comment.trim();
  if (trimmed.length < 3) {
    return {
      valid: false,
      error: 'Komentarz musi zawierać co najmniej 3 znaki.',
    };
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      valid: false,
      error: `Komentarz może mieć maksymalnie ${MAX_COMMENT_LENGTH} znaków.`,
    };
  }
  return { valid: true };
}

export function validatePlaceInput(
  name: string,
  category: string,
  address: string
): { valid: boolean; error?: string } {
  if (name.trim().length < 2 || name.trim().length > 80) {
    return {
      valid: false,
      error: 'Nazwa lokalu musi mieć od 2 do 80 znaków.',
    };
  }
  if (!VALID_CATEGORIES.includes(category as PlaceCategory)) {
    return {
      valid: false,
      error: 'Wybierz poprawną kategorię lokalu.',
    };
  }
  if (address.trim().length < 5 || address.trim().length > 140) {
    return {
      valid: false,
      error: 'Podaj pełny adres w Knurowie (min. 5 znaków).',
    };
  }
  return { valid: true };
}

export function formatPolishVotes(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  if (abs === 1) return `${abs} głos`;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${abs} głosy`;
  }
  return `${abs} głosów`;
}

