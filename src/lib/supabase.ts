import { createClient, type User } from '@supabase/supabase-js';
import {
  calculateGlobalMean,
  checkUserRateLimit,
  normalizePlaceCategory,
  rankPlaces,
  resolveReviewAuthor,
  type Place,
  type PlaceCategory,
  type RankedPlace,
  type Review,
} from './ranking';
import type { AuthUser, RateLimitStatus } from '../types';

const supabaseUrl =
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  '';

const supabaseAnonKey =
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-id')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function mapSupabaseUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Mieszkaniec Knurowa';
  const avatar =
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    '';

  return {
    id: user.id,
    name: fullName,
    email: user.email || '',
    avatar,
    provider: 'google',
  };
}

export async function fetchSupabaseSnapshot(currentUserId?: string): Promise<{
  places: RankedPlace[];
  globalMeanC: number;
  totalReviews: number;
  rateLimit: RateLimitStatus | null;
}> {
  if (!supabase) {
    throw new Error('Supabase nie jest skonfigurowany.');
  }

  const [placesRes, reviewsRes] = await Promise.all([
    supabase
      .from('places')
      .select('id, name, category, address, tags, lat, lng, created_by, created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('reviews')
      .select(
        'id, place_id, user_id, author_name, author_avatar, rating, comment, is_local_verified, distance_km, created_at, updated_at'
      )
      .order('created_at', { ascending: false }),
  ]);

  if (placesRes.error) {
    throw new Error(`Błąd pobierania lokali: ${placesRes.error.message}`);
  }
  if (reviewsRes.error) {
    throw new Error(`Błąd pobierania opinii: ${reviewsRes.error.message}`);
  }

  const places: Place[] = (placesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: normalizePlaceCategory(row.category, row.name),
    address: row.address,
    tags: Array.isArray(row.tags) ? row.tags : [],
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  }));

  const reviews: Review[] = (reviewsRes.data ?? []).map((row) => ({
    id: row.id,
    placeId: row.place_id,
    userId: row.user_id,
    authorName: row.author_name || 'Mieszkaniec Knurowa',
    authorAvatar: row.author_avatar || '',
    rating: Number(row.rating),
    comment: row.comment,
    isLocalVerified: Boolean(row.is_local_verified),
    distanceKm: Number(row.distance_km ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return {
    places: rankPlaces(places, reviews),
    globalMeanC: calculateGlobalMean(reviews),
    totalReviews: reviews.length,
    rateLimit: currentUserId
      ? checkUserRateLimit(reviews, currentUserId)
      : null,
  };
}

export async function signInWithGoogleSupabase(): Promise<void> {
  if (!supabase) {
    throw new Error('Brak konfiguracji Supabase.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function upsertSupabaseReview(input: {
  placeId: string;
  user: AuthUser;
  rating: number;
  comment: string;
  isLocalVerified: boolean;
  distanceKm: number;
  isEdit: boolean;
  hideName?: boolean;
  hideAvatar?: boolean;
}) {
  if (!supabase) {
    throw new Error('Brak konfiguracji Supabase.');
  }

  const author = resolveReviewAuthor(input.user.name, input.user.avatar, {
    hideName: input.hideName,
    hideAvatar: input.hideAvatar,
  });

  const { error } = await supabase.from('reviews').upsert(
    {
      place_id: input.placeId,
      user_id: input.user.id,
      author_name: author.authorName,
      author_avatar: author.authorAvatar,
      rating: input.rating,
      comment: input.comment.trim(),
      is_local_verified: input.isLocalVerified,
      distance_km: input.distanceKm,
    },
    { onConflict: 'place_id,user_id' }
  );

  if (error) {
    if (error.code === '42501') {
      throw new Error(
        'Odrzucono przez politykę bezpieczeństwa Supabase (RLS): upewnij się, że lokalizacja mieści się w promieniu 10 km od Knurowa i nie przekroczono limitu 3 nowych opinii na 24h.'
      );
    }
    throw new Error(error.message);
  }

  return fetchSupabaseSnapshot(input.user.id);
}

export async function deleteSupabaseReview(input: {
  placeId: string;
  userId: string;
}) {
  if (!supabase) {
    throw new Error('Brak konfiguracji Supabase.');
  }

  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('place_id', input.placeId)
    .eq('user_id', input.userId);

  if (error) {
    throw new Error(`Nie udało się usunąć opinii: ${error.message}`);
  }

  return fetchSupabaseSnapshot(input.userId);
}

export async function insertSupabasePlace(input: {
  name: string;
  category: PlaceCategory;
  address: string;
  tags: string[];
  lat: number;
  lng: number;
  userId: string;
}) {
  if (!supabase) {
    throw new Error('Brak konfiguracji Supabase.');
  }

  const cleanName = input.name.trim();
  const { data: existing } = await supabase
    .from('places')
    .select('id, name')
    .ilike('name', cleanName)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error(
      `Lokal „${existing[0].name}” już znajduje się w rankingu Knurowa.`
    );
  }

  const { error } = await supabase.from('places').insert({
    name: cleanName,
    category: input.category,
    address: input.address.trim(),
    tags: input.tags.slice(0, 5),
    lat: input.lat,
    lng: input.lng,
    created_by: input.userId,
  });

  if (error) {
    if (error.code === '23514' || error.message.includes('places_category_check')) {
      throw new Error(
        'Twoja baza Supabase używa jeszcze starej listy kategorii. Otwórz „Konfiguracja bazy SQL” w stopce i uruchom skrypt migracji w Supabase SQL Editor.'
      );
    }
    throw new Error(`Nie udało się dodać lokalu w Supabase: ${error.message}`);
  }

  return fetchSupabaseSnapshot(input.userId);
}

export async function fetchSupabaseAdminDashboard(
  fallbackPlaces: RankedPlace[]
): Promise<{
  data: import('./admin').AdminDashboardData;
  rpcReady: boolean;
  error?: string;
}> {
  const { buildFallbackAdminDashboard } = await import('./admin');
  if (!supabase) {
    return {
      data: buildFallbackAdminDashboard(fallbackPlaces),
      rpcReady: false,
      error: 'Brak połączenia z Supabase (tryb lokalny).',
    };
  }

  const { data, error } = await supabase.rpc('get_admin_dashboard');
  if (error || !data) {
    return {
      data: buildFallbackAdminDashboard(fallbackPlaces),
      rpcReady: false,
      error: error?.message || 'Funkcja get_admin_dashboard nie została jeszcze utworzona w Supabase.',
    };
  }

  const payload = data as import('./admin').AdminDashboardData;
  return {
    data: {
      stats: payload.stats,
      users: Array.isArray(payload.users) ? payload.users : [],
      recentReviews: Array.isArray(payload.recentReviews) ? payload.recentReviews : [],
      communityPlaces: Array.isArray(payload.communityPlaces) ? payload.communityPlaces : [],
    },
    rpcReady: true,
  };
}

export async function adminDeleteSupabaseReview(
  reviewId: string,
  currentUserId: string
) {
  if (!supabase) {
    throw new Error('Brak konfiguracji Supabase.');
  }
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
  if (error) {
    throw new Error(`Nie udało się usunąć opinii: ${error.message}`);
  }
  return fetchSupabaseSnapshot(currentUserId);
}

export async function adminDeleteSupabasePlace(
  placeId: string,
  currentUserId: string
) {
  if (!supabase) {
    throw new Error('Brak konfiguracji Supabase.');
  }
  const { error } = await supabase.from('places').delete().eq('id', placeId);
  if (error) {
    throw new Error(`Nie udało się usunąć lokalu: ${error.message}`);
  }
  return fetchSupabaseSnapshot(currentUserId);
}

