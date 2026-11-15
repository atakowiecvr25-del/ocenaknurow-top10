import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  MapPinPlus,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import adminSqlRaw from '../../supabase/admin_setup.sql?raw';
import {
  buildFallbackAdminDashboard,
  formatAdminDate,
  formatShortDevice,
  type AdminDashboardData,
} from '../lib/admin';
import { CATEGORY_LABELS } from '../lib/ranking';
import {
  adminDeleteSupabasePlace,
  adminDeleteSupabaseReview,
  fetchSupabaseAdminDashboard,
  isSupabaseConfigured,
} from '../lib/supabase';
import type { AuthUser, RankedPlace, RateLimitStatus } from '../types';

type AdminTab = 'reviews' | 'users' | 'places';

interface AdminPanelProps {
  user: AuthUser;
  places: RankedPlace[];
  globalMeanC: number;
  onSelectPlace: (placeId: string) => void;
  onOpenSqlAdmin: () => void;
  onSnapshotUpdated: (payload: {
    places: RankedPlace[];
    globalMeanC: number;
    totalReviews: number;
    rateLimit: RateLimitStatus | null;
  }) => void;
}

export function AdminPanel({
  user,
  places,
  globalMeanC,
  onSelectPlace,
  onOpenSqlAdmin,
  onSnapshotUpdated,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('reviews');
  const [dashboard, setDashboard] = useState<AdminDashboardData>(() =>
    buildFallbackAdminDashboard(places)
  );
  const [rpcReady, setRpcReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  const [confirmReviewId, setConfirmReviewId] = useState<string | null>(null);
  const [confirmPlaceId, setConfirmPlaceId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetchSupabaseAdminDashboard(places);
      setDashboard(res.data);
      setRpcReady(res.rpcReady);
    } catch (err) {
      setDashboard(buildFallbackAdminDashboard(places));
      setRpcReady(false);
      setActionError(
        err instanceof Error ? err.message : 'Błąd ładowania panelu admina.'
      );
    } finally {
      setLoading(false);
    }
  }, [places]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function handleCopyAdminSql() {
    try {
      await navigator.clipboard.writeText(adminSqlRaw);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Fallback ignored
    }
  }

  async function handleDeleteReview(reviewId: string) {
    if (!rpcReady || !isSupabaseConfigured) return;
    setDeletingId(reviewId);
    setActionError(null);
    try {
      const snapshot = await adminDeleteSupabaseReview(reviewId, user.id);
      onSnapshotUpdated(snapshot);
      setConfirmReviewId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Nie udało się usunąć opinii.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeletePlace(placeId: string) {
    if (!rpcReady || !isSupabaseConfigured) return;
    setDeletingId(placeId);
    setActionError(null);
    try {
      const snapshot = await adminDeleteSupabasePlace(placeId, user.id);
      onSnapshotUpdated(snapshot);
      setConfirmPlaceId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Nie udało się usunąć lokalu.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  const { stats, users, recentReviews, communityPlaces } = dashboard;

  return (
    <section className="space-y-6" aria-label="Panel Administratora">
      {/* Header + Refresh */}
      <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#27272a] pb-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Widok wyłącznie dla administratora ({user.email})</span>
            </p>
            <h2 className="text-xl font-bold text-zinc-100">
              Panel Administratora – Aktywność i Moderacja
            </h2>
            <p className="text-sm text-zinc-400">
              Podgląd zalogowanych kont Google, najnowszych opinii, zgłoszonych
              lokali oraz moderacja wpisów.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#09090b] px-4 py-2 text-xs font-medium text-zinc-200 hover:border-emerald-500 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Odśwież dane</span>
          </button>
        </div>

        {/* One-time SQL setup banner for Admin RPC (visible ONLY inside Admin panel) */}
        {isSupabaseConfigured && !rpcReady && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Włącz pełny podgląd kont Google (auth.users) i usuwanie spamu
                </span>
              </p>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                Opinie i lokale widzisz już teraz. Aby pobrać z Supabase pełną
                listę wszystkich zalogowanych osób (wraz z datą ostatniego
                logowania i e-mailem) oraz włączyć moderację, wklej jednorazowo
                skrypt <span className="font-mono">admin_setup.sql</span> w
                Supabase → SQL Editor → Run.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopyAdminSql()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 px-3.5 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 transition-colors"
              >
                {copiedSql ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Skopiowano SQL</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Kopiuj SQL Panelu Admina</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onOpenSqlAdmin}
                className="rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-xs font-medium text-zinc-200 hover:text-white transition-colors"
              >
                Podgląd SQL
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {actionError}
          </div>
        )}

        {/* 4 Clean Typographic Stat Blocks */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4 space-y-1">
            <span className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>{rpcReady ? 'Konta Google' : 'Autorzy aktywni'}</span>
            </span>
            <p className="text-2xl font-bold tabular-nums text-zinc-100">
              {stats.totalUsers}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums">
              24h: {stats.activeUsers24h} · 7 dni: {stats.activeUsers7d}
            </p>
          </div>

          <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4 space-y-1">
            <span className="text-xs text-zinc-400 flex items-center gap-1.5">
              <MessageSquare
                className="h-3.5 w-3.5 text-amber-400"
                aria-hidden="true"
              />
              <span>Wszystkie opinie</span>
            </span>
            <p className="text-2xl font-bold tabular-nums text-zinc-100">
              {stats.totalReviews}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums">
              24h: {stats.reviews24h} · 7 dni: {stats.reviews7d}
            </p>
          </div>

          <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4 space-y-1">
            <span className="text-xs text-zinc-400">Średnia globalna C</span>
            <p className="text-2xl font-bold tabular-nums text-amber-400">
              {globalMeanC.toFixed(2)}
            </p>
            <p className="text-xs text-zinc-500">Próg Bayesa m = 10</p>
          </div>

          <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4 space-y-1">
            <span className="text-xs text-zinc-400 flex items-center gap-1.5">
              <MapPinPlus
                className="h-3.5 w-3.5 text-sky-400"
                aria-hidden="true"
              />
              <span>Zgłoszone lokale</span>
            </span>
            <p className="text-2xl font-bold tabular-nums text-zinc-100">
              {stats.communityPlacesCount}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums">
              z {stats.totalPlaces} miejsc w bazie
            </p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div
          role="tablist"
          aria-label="Sekcje panelu administratora"
          className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'reviews'}
            onClick={() => setActiveTab('reviews')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'reviews'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Najnowsze opinie ({recentReviews.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Konta i aktywność ({users.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'places'}
            onClick={() => setActiveTab('places')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'places'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Zgłoszone lokale ({communityPlaces.length})
          </button>
        </div>

        {/* Tab 1: Najnowsze opinie */}
        {activeTab === 'reviews' && (
          <div className="divide-y divide-[#27272a] rounded-lg border border-[#27272a] bg-[#09090b]">
            {recentReviews.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Brak zapisanych opinii w bazie.
              </div>
            ) : (
              recentReviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                      <span className="font-bold tabular-nums text-amber-400">
                        {rev.rating}/10
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectPlace(rev.placeId)}
                        className="font-semibold text-zinc-100 hover:text-emerald-400 inline-flex items-center gap-1 text-left transition-colors"
                      >
                        <span>{rev.placeName}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </button>
                      <span className="text-xs text-zinc-500">
                        {CATEGORY_LABELS[rev.placeCategory] ?? rev.placeCategory}
                      </span>
                    </div>

                    <p className="text-sm text-zinc-300 leading-relaxed break-words">
                      {rev.comment}
                    </p>

                    <p className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>
                        Publicznie:{' '}
                        <span className="text-zinc-300">{rev.authorName}</span>
                      </span>
                      {rev.userEmail && (
                        <span>
                          · Konto Google:{' '}
                          <span className="text-zinc-300">
                            {rev.userGoogleName || 'Brak nazwy'} ({rev.userEmail})
                          </span>
                        </span>
                      )}
                      <span>· GPS: {rev.distanceKm.toFixed(2)} km</span>
                      <span>
                        · {formatAdminDate(rev.isEdited ? rev.updatedAt : rev.createdAt)}
                        {rev.isEdited ? ' (edytowana)' : ''}
                      </span>
                    </p>
                  </div>

                  {rpcReady && isSupabaseConfigured && (
                    <div className="flex items-center gap-2 shrink-0">
                      {confirmReviewId === rev.id ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingId === rev.id}
                            onClick={() => void handleDeleteReview(rev.id)}
                            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                          >
                            {deletingId === rev.id ? 'Usuwanie...' : 'Potwierdź'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmReviewId(null)}
                            className="rounded-md border border-[#27272a] px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white"
                          >
                            Anuluj
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmReviewId(rev.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#27272a] px-2.5 py-1.5 text-xs text-zinc-400 hover:border-rose-500/50 hover:text-rose-400 transition-colors"
                          title="Usuń opinię"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Usuń</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Konta i aktywność */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Lista obejmuje konta zalogowane przez Google (Supabase zapisuje
              czas ostatniego logowania dla każdego użytkownika). Osoby
              przeglądające ranking bez logowania nie zostawiają danych osobowych
              w bazie.
            </p>
            <div className="divide-y divide-[#27272a] rounded-lg border border-[#27272a] bg-[#09090b]">
              {users.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-400">
                  Brak zarejestrowanych kont.
                </div>
              ) : (
                users.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt={u.fullName}
                          className="h-9 w-9 rounded-full object-cover border border-[#27272a] shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-zinc-800 border border-[#27272a] flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-100 truncate">
                          {u.fullName}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                          {u.email || `ID: ${u.id.slice(0, 8)}...`}
                        </p>
                        {(u.lastIp || u.lastUserAgent) && (
                          <p className="text-xs text-zinc-500 truncate mt-0.5 tabular-nums">
                            {u.lastIp ? `IP: ${u.lastIp}` : ''}
                            {u.lastIp && u.lastUserAgent ? ' · ' : ''}
                            {u.lastUserAgent ? formatShortDevice(u.lastUserAgent) : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 tabular-nums shrink-0">
                      <span>
                        Opinie:{' '}
                        <strong className="text-zinc-200">{u.reviewsCount}</strong>
                      </span>
                      <span>
                        Dodane lokale:{' '}
                        <strong className="text-zinc-200">
                          {u.placesAddedCount}
                        </strong>
                      </span>
                      <span>
                        Ostatnie logowanie:{' '}
                        <span className="text-zinc-300">
                          {formatAdminDate(u.lastSignInAt)}
                        </span>
                      </span>
                      <span>
                        Dołączył:{' '}
                        <span className="text-zinc-500">
                          {formatAdminDate(u.createdAt)}
                        </span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Zgłoszone lokale */}
        {activeTab === 'places' && (
          <div className="divide-y divide-[#27272a] rounded-lg border border-[#27272a] bg-[#09090b]">
            {communityPlaces.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Nikt jeszcze nie zgłosił nowego lokalu przez przycisk „Zgłoś
                lokal”.
              </div>
            ) : (
              communityPlaces.map((pl) => (
                <div
                  key={pl.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectPlace(pl.id)}
                        className="text-sm font-semibold text-zinc-100 hover:text-emerald-400 inline-flex items-center gap-1 transition-colors"
                      >
                        <span>{pl.name}</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <span className="text-xs text-zinc-500">
                        · {CATEGORY_LABELS[pl.category] ?? pl.category}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{pl.address}</p>
                    <p className="text-xs text-zinc-500">
                      Zgłosił:{' '}
                      <span className="text-zinc-300">
                        {pl.creatorName || 'Użytkownik'}
                        {pl.creatorEmail ? ` (${pl.creatorEmail})` : ''}
                      </span>{' '}
                      · {formatAdminDate(pl.createdAt)}
                    </p>
                  </div>

                  {rpcReady && isSupabaseConfigured && (
                    <div className="flex items-center gap-2 shrink-0">
                      {confirmPlaceId === pl.id ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingId === pl.id}
                            onClick={() => void handleDeletePlace(pl.id)}
                            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                          >
                            {deletingId === pl.id ? 'Usuwanie...' : 'Potwierdź'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmPlaceId(null)}
                            className="rounded-md border border-[#27272a] px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white"
                          >
                            Anuluj
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmPlaceId(pl.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#27272a] px-2.5 py-1.5 text-xs text-zinc-400 hover:border-rose-500/50 hover:text-rose-400 transition-colors"
                          title="Usuń lokal"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Usuń</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
