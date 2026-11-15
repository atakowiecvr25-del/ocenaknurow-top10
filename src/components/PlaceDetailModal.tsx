import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ExternalLink,
  EyeOff,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { verifyKnurowLocation } from '../lib/geo';
import {
  ANONYMOUS_AUTHOR_NAME,
  BAYES_MINIMUM_VOTES_M,
  CATEGORY_LABELS,
  MAX_COMMENT_LENGTH,
  validateReviewInput,
} from '../lib/ranking';
import {
  deleteSupabaseReview,
  isSupabaseConfigured,
  upsertSupabaseReview,
} from '../lib/supabase';
import type {
  AuthUser,
  GpsState,
  RankedPlace,
  RateLimitStatus,
} from '../types';
import { RatingDistributionBars } from './RatingDistributionBars';

interface PlaceDetailModalProps {
  place: RankedPlace | null;
  globalMeanC: number;
  user: AuthUser | null;
  rateLimit: RateLimitStatus | null;
  gps: GpsState;
  canSimulateGps: boolean;
  onRequestGps: () => void;
  onSimulateCoords: (lat: number, lng: number) => void;
  onOpenAuth: () => void;
  onClose: () => void;
  onReviewSaved: (payload: {
    places: RankedPlace[];
    globalMeanC: number;
    totalReviews: number;
    rateLimit: RateLimitStatus | null;
  }) => void;
}

export function PlaceDetailModal({
  place,
  globalMeanC,
  user,
  rateLimit,
  gps,
  canSimulateGps,
  onRequestGps,
  onSimulateCoords,
  onOpenAuth,
  onClose,
  onReviewSaved,
}: PlaceDetailModalProps) {
  const existingUserReview =
    place && user
      ? place.reviews.find((r) => r.userId === user.id) ?? null
      : null;

  const [rating, setRating] = useState<number>(8);
  const [comment, setComment] = useState<string>('');
  const [hideName, setHideName] = useState<boolean>(false);
  const [hideAvatar, setHideAvatar] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [showTestCoords, setShowTestCoords] = useState(false);

  const [showMapPreview, setShowMapPreview] = useState(false);

  useEffect(() => {
    if (!place) return;
    if (existingUserReview) {
      setRating(existingUserReview.rating);
      setComment(existingUserReview.comment);
      setHideName(existingUserReview.authorName === ANONYMOUS_AUTHOR_NAME);
      setHideAvatar(!existingUserReview.authorAvatar);
    } else {
      setRating(8);
      setComment('');
      setHideName(false);
      setHideAvatar(false);
    }
    setConfirmDelete(false);
    setSubmitError(null);
    setSubmitSuccess(null);
    setShowMapPreview(false);
  }, [place?.id, existingUserReview?.id]);

  useEffect(() => {
    if (!place) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [place, onClose]);

  if (!place) return null;

  const mapsQuery = encodeURIComponent(`${place.name}, ${place.address}`);
  const directMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`;
  const bboxPad = 0.0045;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${(
    place.lng - bboxPad
  ).toFixed(5)},${(place.lat - bboxPad).toFixed(5)},${(
    place.lng + bboxPad
  ).toFixed(5)},${(place.lat + bboxPad).toFixed(5)}&layer=mapnik&marker=${place.lat},${place.lng}`;

  const localCheck =
    gps.lat !== null && gps.lng !== null
      ? verifyKnurowLocation(gps.lat, gps.lng)
      : null;

  const canSubmit =
    Boolean(user) &&
    gps.status === 'verified' &&
    Boolean(localCheck?.isLocalVerified) &&
    (Boolean(existingUserReview) || (rateLimit ? rateLimit.allowed : true));

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!place) return;
    if (!user) {
      onOpenAuth();
      return;
    }
    if (gps.status !== 'verified' || gps.lat === null || gps.lng === null) {
      setSubmitError(
        'Najpierw zweryfikuj lokalizację GPS (promień maksymalnie 10 km od centrum Knurowa).'
      );
      return;
    }

    const validation = validateReviewInput(rating, comment);
    if (!validation.valid) {
      setSubmitError(validation.error || 'Nieprawidłowe dane opinii.');
      return;
    }

    const geoCheck = verifyKnurowLocation(gps.lat, gps.lng);
    if (!geoCheck.isLocalVerified) {
      setSubmitError(
        `Głos zablokowany: Twoja lokalizacja znajduje się ${geoCheck.distanceKm} km od Knurowa (limit: 10 km).`
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      if (isSupabaseConfigured) {
        if (!existingUserReview && rateLimit && !rateLimit.allowed) {
          setSubmitError(
            'Przekroczono limit anty-spamowy: maksymalnie 3 nowe opinie na konto Google w ciągu 24 godzin.'
          );
          return;
        }
        const snapshot = await upsertSupabaseReview({
          placeId: place.id,
          user,
          rating,
          comment,
          isLocalVerified: geoCheck.isLocalVerified,
          distanceKm: geoCheck.distanceKm,
          isEdit: Boolean(existingUserReview),
          hideName,
          hideAvatar,
        });
        onReviewSaved(snapshot);
        setSubmitSuccess(
          existingUserReview
            ? 'Zaktualizowano Twoją opinię w Supabase i przeliczono wynik Bayesa.'
            : 'Dodano zweryfikowaną opinię do Supabase! Ranking został zaktualizowany.'
        );
        return;
      }

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.id,
          rating,
          comment,
          lat: gps.lat,
          lng: gps.lng,
          hideName,
          hideAvatar,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Nie udało się zapisać opinii.');
        return;
      }

      onReviewSaved({
        places: data.places,
        globalMeanC: data.globalMeanC,
        totalReviews: data.totalReviews,
        rateLimit: data.rateLimit,
      });
      setSubmitSuccess(
        data.action === 'updated'
          ? 'Zaktualizowano Twoją opinię i przeliczono wynik Bayesa.'
          : 'Dodano zweryfikowaną opinię! Ranking został zaktualizowany.'
      );
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Błąd sieci podczas wysyłania opinii.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteReview() {
    if (!place || !user || !existingUserReview) return;
    setDeleting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      if (isSupabaseConfigured) {
        const snapshot = await deleteSupabaseReview({
          placeId: place.id,
          userId: user.id,
        });
        onReviewSaved(snapshot);
        setConfirmDelete(false);
        setSubmitSuccess('Twoja opinia została usunięta.');
        return;
      }

      const res = await fetch(`/api/reviews/${encodeURIComponent(place.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Nie udało się usunąć opinii.');
        return;
      }
      onReviewSaved({
        places: data.places,
        globalMeanC: data.globalMeanC,
        totalReviews: data.totalReviews,
        rateLimit: data.rateLimit,
      });
      setConfirmDelete(false);
      setSubmitSuccess('Twoja opinia została usunięta.');
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Błąd sieci podczas usuwania opinii.'
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:py-8 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-detail-title"
    >
      <div className="w-full max-w-3xl rounded-xl border border-[#27272a] bg-[#18181b] shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#27272a] px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
              <span className="font-mono font-semibold text-amber-400 tabular-nums">
                Pozycja #{place.rank}
              </span>
              <span aria-hidden="true">·</span>
              <span>{CATEGORY_LABELS[place.category]}</span>
              <span aria-hidden="true">·</span>
              <span>{place.address}</span>
            </div>
            <h2
              id="place-detail-title"
              className="text-xl sm:text-2xl font-bold text-zinc-100"
            >
              {place.name}
            </h2>
            {place.tags.length > 0 && (
              <p className="text-xs text-zinc-500">
                {place.tags.join(' · ')}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij szczegóły lokalu"
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="divide-y divide-[#27272a]">
          {/* Bayes breakdown & distribution */}
          <section className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-3xl font-bold tabular-nums text-amber-400">
                  <Star className="h-6 w-6 fill-amber-400 text-amber-400" aria-hidden="true" />
                  {place.bayesScore.toFixed(2)}
                </span>
                <span className="text-sm font-mono text-zinc-500">/ 10.00 (Bayes WR)</span>
              </div>
              <p className="text-xs text-zinc-400 font-mono tabular-nums">
                Średnia surowa R ={' '}
                {place.rawAverage !== null ? place.rawAverage.toFixed(2) : '—'} ·
                Zweryfikowane głosy v = {place.verifiedVotes} · Próg m ={' '}
                {BAYES_MINIMUM_VOTES_M} · Globalna C = {globalMeanC.toFixed(2)}
              </p>
              {place.isProvisional && (
                <p className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Mało głosów – pozycja tymczasowa (wymagane {BAYES_MINIMUM_VOTES_M} głosów dla pełnej wagi)
                  </span>
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-400 mb-2">
                Rozkład ocen (1–10)
              </p>
              <RatingDistributionBars distribution={place.ratingDistribution} />
            </div>
          </section>

          {/* Google Maps & Location Preview */}
          <section className="px-6 py-5 space-y-3 bg-[#09090b]/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <span>Lokalizacja i Mapy Google</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  {place.address} · otwórz wizytówkę, wyznacz trasę lub podejrzyj pinezkę na mapie.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={directMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-600/15 px-3.5 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-600/25 hover:text-white transition-colors whitespace-nowrap"
                >
                  <span>Otwórz w Google Maps</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#18181b] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:border-emerald-500/60 hover:text-white transition-colors whitespace-nowrap"
                >
                  <Navigation className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Wyznacz trasę</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowMapPreview((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#18181b] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors whitespace-nowrap"
                >
                  <MapIcon className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  <span>{showMapPreview ? 'Ukryj mapę' : 'Podgląd mapy'}</span>
                </button>
              </div>
            </div>

            {showMapPreview && (
              <div className="overflow-hidden rounded-lg border border-[#27272a] bg-[#09090b]">
                <iframe
                  title={`Mapa lokalizacji: ${place.name}`}
                  src={osmEmbedUrl}
                  loading="lazy"
                  className="h-56 w-full border-0"
                />
              </div>
            )}
          </section>

          {/* Add / Edit Review Form */}
          <section className="px-6 py-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">
                {existingUserReview ? 'Edytuj swoją opinię' : 'Dodaj zweryfikowaną opinię'}
              </h3>
              {user && rateLimit && !existingUserReview && (
                <span className="text-xs font-mono tabular-nums text-zinc-400">
                  Limit 24h: pozostało {rateLimit.remaining}/3 nowych opinii
                </span>
              )}
            </div>

            {!user ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-[#27272a] bg-[#09090b] p-4">
                <p className="text-xs sm:text-sm text-zinc-400">
                  Aby wyeliminować fałszywe konta, ocenianie wymaga autoryzacji
                  Google OAuth oraz potwierdzenia lokalizacji w promieniu 10 km od
                  Knurowa.
                </p>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
                >
                  Zaloguj przez Google, aby ocenić
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                {/* GPS Verification Bar */}
                <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      {gps.status === 'verified' ? (
                        <>
                          <ShieldCheck
                            className="h-4 w-4 text-emerald-500 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-emerald-400 font-medium">
                            Zweryfikowano w Knurowie ({gps.distanceKm?.toFixed(2)} km od centrum · {gps.zoneLabel})
                          </span>
                        </>
                      ) : gps.status === 'rejected' ? (
                        <>
                          <ShieldAlert
                            className="h-4 w-4 text-rose-400 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-rose-400 font-medium">
                            {gps.errorMessage}
                          </span>
                        </>
                      ) : gps.status === 'error' ? (
                        <>
                          <ShieldAlert
                            className="h-4 w-4 text-amber-400 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-amber-300">
                            {gps.errorMessage}
                          </span>
                        </>
                      ) : (
                        <>
                          <LocateFixed
                            className="h-4 w-4 text-zinc-400 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-zinc-400">
                            Wymagana weryfikacja GPS (maks. 10 km od Knurowa)
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onRequestGps}
                        disabled={gps.status === 'locating'}
                        className="rounded-lg border border-[#27272a] bg-[#18181b] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-emerald-500 transition-colors whitespace-nowrap"
                      >
                        {gps.status === 'locating'
                          ? 'Pobieranie GPS...'
                          : gps.status === 'verified'
                            ? 'Odśwież GPS'
                            : 'Sprawdź lokalizację GPS'}
                      </button>
                      {canSimulateGps && (
                        <button
                          type="button"
                          onClick={() => setShowTestCoords((v) => !v)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 underline whitespace-nowrap"
                        >
                          {showTestCoords ? 'Ukryj symulator' : 'Test strefy'}
                        </button>
                      )}
                    </div>
                  </div>

                  {canSimulateGps && showTestCoords && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-[#27272a] pt-2.5 text-xs">
                      <span className="text-zinc-500">
                        Symulacja współrzędnych Haversine:
                      </span>
                      <button
                        type="button"
                        onClick={() => onSimulateCoords(50.2225, 18.6708)}
                        className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-300 hover:border-emerald-500 hover:text-emerald-400"
                      >
                        Knurów Centrum (0 km)
                      </button>
                      <button
                        type="button"
                        onClick={() => onSimulateCoords(50.1947, 18.6368)}
                        className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-300 hover:border-emerald-500 hover:text-emerald-400"
                      >
                        Szczygłowice (3.9 km)
                      </button>
                      <button
                        type="button"
                        onClick={() => onSimulateCoords(50.2649, 19.0238)}
                        className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-300 hover:border-rose-500 hover:text-rose-400"
                      >
                        Katowice (25.6 km – blokada)
                      </button>
                    </div>
                  )}
                </div>

                {/* Rating 1-10 Selector */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-2">
                    Twoja ocena w skali 1–10:{' '}
                    <span className="font-mono font-bold text-amber-400 tabular-nums">
                      {rating}/10
                    </span>
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Ocena od 1 do 10"
                    className="grid grid-cols-5 sm:grid-cols-10 gap-1.5"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
                      const active = rating === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setRating(val)}
                          className={`h-9 rounded-lg font-mono text-sm font-semibold tabular-nums border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                            active
                              ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                              : 'border-[#27272a] bg-[#09090b] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600'
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Comment */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="review-comment"
                      className="text-xs font-medium text-zinc-300"
                    >
                      Komentarz (maks. {MAX_COMMENT_LENGTH} znaków)
                    </label>
                    <span className="text-xs font-mono tabular-nums text-zinc-500">
                      {comment.length}/{MAX_COMMENT_LENGTH}
                    </span>
                  </div>
                  <textarea
                    id="review-comment"
                    rows={3}
                    maxLength={MAX_COMMENT_LENGTH}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Napisz konkretnie o jakości, czasie obsługi, cenach lub klimacie w lokalu..."
                    required
                    className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Independent privacy checkboxes: hide name / hide profile picture */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-start gap-2.5 rounded-lg border border-[#27272a] bg-[#09090b] px-3.5 py-2.5 cursor-pointer select-none hover:border-zinc-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={hideName}
                      onChange={(e) => setHideName(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 accent-emerald-500 cursor-pointer shrink-0"
                    />
                    <span className="text-xs">
                      <span className="font-medium text-zinc-200">
                        Ukryj nazwę
                      </span>
                      <span className="block text-zinc-500">
                        {hideName
                          ? `Wyświetli się jako „${ANONYMOUS_AUTHOR_NAME}”`
                          : `Widoczna nazwa: ${user.name}`}
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 rounded-lg border border-[#27272a] bg-[#09090b] px-3.5 py-2.5 cursor-pointer select-none hover:border-zinc-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={hideAvatar}
                      onChange={(e) => setHideAvatar(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 accent-emerald-500 cursor-pointer shrink-0"
                    />
                    <span className="text-xs">
                      <span className="font-medium text-zinc-200">
                        Ukryj zdjęcie profilowe
                      </span>
                      <span className="block text-zinc-500">
                        {hideAvatar
                          ? 'Neutralna ikona zamiast awatara'
                          : 'Pokaż zdjęcie z konta Google'}
                      </span>
                    </span>
                  </label>
                </div>

                {submitError && (
                  <p role="alert" className="text-xs text-rose-400">
                    {submitError}
                  </p>
                )}
                {submitSuccess && (
                  <p role="status" className="text-xs text-emerald-400">
                    {submitSuccess}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {gps.status !== 'verified' ? (
                    <span className="text-xs text-zinc-400">
                      Kliknij „Sprawdź lokalizację GPS” powyżej, aby odblokować wysyłanie.
                    </span>
                  ) : !existingUserReview && rateLimit && !rateLimit.allowed ? (
                    <span className="text-xs text-amber-400">
                      Wykorzystano dzienny limit 3/3 nowych opinii w ciągu 24h
                      {rateLimit.resetAtIso
                        ? ` (kolejny głos po ${new Date(
                            rateLimit.resetAtIso
                          ).toLocaleTimeString('pl-PL', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })})`
                        : ''}
                      . Nadal możesz edytować lub usunąć swoje wcześniejsze opinie.
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">
                      {existingUserReview
                        ? 'Edycja istniejącej recenzji (limit 1 opinia / lokal)'
                        : 'Konto Google może dodać 1 recenzję dla tego lokalu'}
                    </span>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {existingUserReview &&
                      (confirmDelete ? (
                        <>
                          <button
                            type="button"
                            disabled={deleting || submitting}
                            onClick={() => void handleDeleteReview()}
                            className="rounded-lg border border-rose-500/60 bg-rose-600/20 px-3.5 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-600/30 transition-colors disabled:opacity-40 whitespace-nowrap"
                          >
                            {deleting ? 'Usuwanie...' : 'Potwierdź usunięcie'}
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => setConfirmDelete(false)}
                            className="rounded-lg border border-[#27272a] px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors whitespace-nowrap"
                          >
                            Anuluj
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={deleting || submitting}
                          onClick={() => setConfirmDelete(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-3.5 py-2.5 text-xs font-medium text-zinc-400 hover:border-rose-500/50 hover:text-rose-300 transition-colors whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Usuń opinię</span>
                        </button>
                      ))}
                    <button
                      type="submit"
                      disabled={submitting || deleting || !canSubmit}
                      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {submitting
                        ? 'Zapisywanie...'
                        : existingUserReview
                          ? 'Zaktualizuj opinię'
                          : 'Opublikuj opinię'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>

          {/* Reviews List */}
          <section className="px-6 py-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200">
              Recenzje mieszkańców ({place.reviews.length})
            </h3>
            {place.reviews.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2">
                Ten lokal nie ma jeszcze żadnych opinii. Bądź pierwszą osobą z
                Knurowa!
              </p>
            ) : (
              <ul className="divide-y divide-[#27272a]">
                {place.reviews.map((rev) => {
                  const initials = rev.authorName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  const dateFormatted = new Date(
                    rev.updatedAt || rev.createdAt
                  ).toLocaleDateString('pl-PL', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });

                  const isNameHidden = rev.authorName === ANONYMOUS_AUTHOR_NAME;
                  return (
                    <li key={rev.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-zinc-800 border border-[#27272a] text-[11px] font-semibold text-zinc-200">
                            {rev.authorAvatar ? (
                              <img
                                src={rev.authorAvatar}
                                alt={rev.authorName}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            ) : isNameHidden ? (
                              <EyeOff className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                            ) : (
                              initials || 'GK'
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-zinc-200">
                              {rev.authorName}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                              <span>{dateFormatted}</span>
                              {rev.isLocalVerified && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 text-emerald-400">
                                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                    Zweryfikowano w Knurowie ({rev.distanceKm.toFixed(1)} km)
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="font-mono text-sm font-bold tabular-nums text-amber-400">
                          {rev.rating}/10
                        </div>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed pl-9">
                        {rev.comment}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
