import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { verifyKnurowLocation } from './lib/geo';
import {
  BAYES_MINIMUM_VOTES_M,
  CATEGORY_LABELS,
  type PlaceCategory,
} from './lib/ranking';
import {
  fetchSupabaseSnapshot,
  isSupabaseConfigured,
  mapSupabaseUser,
  signOutSupabase,
  supabase,
} from './lib/supabase';
import type {
  ActiveNavSection,
  AuthUser,
  GpsState,
  RankedPlace,
  RateLimitStatus,
} from './types';
import { AddPlaceModal } from './components/AddPlaceModal';
import { GoogleAuthModal } from './components/GoogleAuthModal';
import { GpsStatusPanel } from './components/GpsStatusPanel';
import { MapsExplorerPanel } from './components/MapsExplorerPanel';
import { PlaceCard } from './components/PlaceCard';
import { PlaceDetailModal } from './components/PlaceDetailModal';
import { SqlSchemaPanel } from './components/SqlSchemaPanel';
import { TopBar } from './components/TopBar';

type CategoryFilter = 'wszystkie' | PlaceCategory;

const FILTER_ORDER: CategoryFilter[] = [
  'wszystkie',
  'kebab',
  'pizzeria',
  'restauracje',
  'kawiarnie',
  'barber',
  'fryzjer',
  'zabka',
  'lidl',
  'biedronka',
  'markety',
  'szkoly',
  'silownie',
  'boiska',
  'inne',
];

export default function App() {
  const [places, setPlaces] = useState<RankedPlace[]>([]);
  const [globalMeanC, setGlobalMeanC] = useState<number>(7.0);
  const [totalReviews, setTotalReviews] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<ActiveNavSection>('ranking');
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>('wszystkie');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyEstablished, setOnlyEstablished] = useState<boolean>(false);
  const [showAllPlaces, setShowAllPlaces] = useState<boolean>(false);

  const isSetupQuery =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('setup') === 'sql';

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isAddPlaceOpen, setIsAddPlaceOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);

  const [gps, setGps] = useState<GpsState>({
    status: 'idle',
    lat: null,
    lng: null,
    distanceKm: null,
    zoneLabel: null,
    errorMessage: null,
  });

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        const mappedUser = mapSupabaseUser(sessionData.session?.user ?? null);
        setUser(mappedUser);

        const snapshot = await fetchSupabaseSnapshot(mappedUser?.id);
        setPlaces(snapshot.places);
        setGlobalMeanC(snapshot.globalMeanC);
        setTotalReviews(snapshot.totalReviews);
        setRateLimit(snapshot.rateLimit);
        return;
      }

      const [placesRes, authRes] = await Promise.all([
        fetch('/api/places'),
        fetch('/api/auth/me'),
      ]);
      if (!placesRes.ok) {
        throw new Error('Nie udało się załadować rankingu.');
      }
      const placesData = await placesRes.json();
      setPlaces(placesData.places ?? []);
      setGlobalMeanC(placesData.globalMeanC ?? 7.0);
      setTotalReviews(placesData.totalReviews ?? 0);

      if (authRes.ok) {
        const authData = await authRes.json();
        setUser(authData.user ?? null);
        setRateLimit(authData.rateLimit ?? null);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Błąd ładowania danych rankingu.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const mapped = mapSupabaseUser(session?.user ?? null);
        setUser(mapped);
        void fetchSupabaseSnapshot(mapped?.id)
          .then((snapshot) => {
            setPlaces(snapshot.places);
            setGlobalMeanC(snapshot.globalMeanC);
            setTotalReviews(snapshot.totalReviews);
            setRateLimit(snapshot.rateLimit);
          })
          .catch(() => {});
      }
    );
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const applyCoordinates = useCallback((lat: number, lng: number) => {
    const check = verifyKnurowLocation(lat, lng);
    if (check.isLocalVerified) {
      setGps({
        status: 'verified',
        lat,
        lng,
        distanceKm: check.distanceKm,
        zoneLabel: check.zoneLabel,
        errorMessage: null,
      });
    } else {
      setGps({
        status: 'rejected',
        lat,
        lng,
        distanceKm: check.distanceKm,
        zoneLabel: check.zoneLabel,
        errorMessage: `Znajdujesz się ${check.distanceKm.toFixed(2)} km od centrum Knurowa (limit: 10 km). Głosowanie zablokowane.`,
      });
    }
  }, []);

  const handleRequestGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGps((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: isSupabaseConfigured
          ? 'Twoja przeglądarka nie obsługuje geolokalizacji GPS.'
          : 'Twoja przeglądarka nie obsługuje geolokalizacji GPS. Użyj symulatora strefy do testów.',
      }));
      return;
    }

    setGps((prev) => ({ ...prev, status: 'locating', errorMessage: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyCoordinates(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        let message = 'Odrzucono dostęp do lokalizacji GPS. Bez weryfikacji w promieniu 10 km głosowanie jest zablokowane.';
        if (err.code === err.POSITION_UNAVAILABLE) {
          message = 'Sygnał GPS jest niedostępny na tym urządzeniu.';
        } else if (err.code === err.TIMEOUT) {
          message = 'Przekroczono czas oczekiwania na lokalizację GPS.';
        }
        setGps((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: message,
        }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, [applyCoordinates]);

  const handleLogout = useCallback(async () => {
    if (isSupabaseConfigured) {
      await signOutSupabase();
    } else {
      await fetch('/api/auth/logout', { method: 'POST' });
    }
    setUser(null);
    setRateLimit(null);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      wszystkie: places.length,
      kebab: 0,
      pizzeria: 0,
      restauracje: 0,
      kawiarnie: 0,
      barber: 0,
      fryzjer: 0,
      zabka: 0,
      lidl: 0,
      biedronka: 0,
      markety: 0,
      szkoly: 0,
      silownie: 0,
      boiska: 0,
      inne: 0,
    };
    for (const p of places) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [places]);

  const filteredPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return places.filter((p) => {
      if (selectedCategory !== 'wszystkie' && p.category !== selectedCategory) {
        return false;
      }
      if (onlyEstablished && p.isProvisional) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [places, selectedCategory, searchQuery, onlyEstablished]);

  const displayedPlaces = useMemo(
    () => (showAllPlaces ? filteredPlaces : filteredPlaces.slice(0, 10)),
    [filteredPlaces, showAllPlaces]
  );

  const selectedPlace = useMemo(
    () => places.find((p) => p.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId]
  );

  const needsSqlMigration =
    isSupabaseConfigured &&
    !loading &&
    places.length > 0 &&
    (places.length < 125 ||
      !places.some((p) => p.category === 'boiska') ||
      !places.some((p) => p.category === 'restauracje') ||
      !places.some((p) => p.category === 'kawiarnie') ||
      !places.some((p) => p.category === 'markety') ||
      !places.some((p) => p.name.toLowerCase().includes('axiniia')) ||
      !places.some((p) => p.name.toLowerCase().includes('gym city')) ||
      !places.some(
        (p) => p.name.toLowerCase().includes('pub 777') && p.category === 'pizzeria'
      ));

  const showSqlTools = !isSupabaseConfigured || needsSqlMigration || isSetupQuery;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      <TopBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={() => void handleLogout()}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8 space-y-8">
        {/* Hero Header */}
        <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 border-b border-[#27272a] pb-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Knurów · woj. śląskie · Weryfikacja GPS (10 km) + Google OAuth</span>
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100 [text-wrap:balance]">
              OcenaKnurów – TOP 10
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
              Autentyczny ranking lokalnych miejsc w Knurowie obliczany średnią
              ważoną Bayesa (próg m = {BAYES_MINIMUM_VOTES_M} głosów), odporny na
              pojedyncze oceny i masowe multi-konta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 shrink-0">
            <div className="text-left">
              <div className="text-xs text-zinc-500">Lokale w bazie</div>
              <div className="font-mono text-xl font-bold tabular-nums text-zinc-100">
                {places.length}
              </div>
            </div>
            <div className="text-left">
              <div className="text-xs text-zinc-500">Zweryfikowane głosy</div>
              <div className="font-mono text-xl font-bold tabular-nums text-emerald-400">
                {totalReviews}
              </div>
            </div>
            <div className="text-left">
              <div className="text-xs text-zinc-500">Średnia globalna C</div>
              <div className="font-mono text-xl font-bold tabular-nums text-amber-400">
                {globalMeanC.toFixed(2)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAddPlaceOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#18181b] px-4 py-2.5 text-xs font-semibold text-zinc-100 hover:border-emerald-500 hover:text-white transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>Zgłoś lokal</span>
            </button>
          </div>
        </section>

        {activeSection === 'ranking' && (
          <section className="space-y-5" aria-label="Ranking lokali w Knurowie">
            {/* Category Tabs + Live Search Toolbar */}
            <div className="flex flex-col gap-4">
              <div
                role="tablist"
                aria-label="Kategorie lokali"
                className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#27272a] bg-[#18181b] p-1.5"
              >
                {FILTER_ORDER.map((cat) => {
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setShowAllPlaces(false);
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        active
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <span>{CATEGORY_LABELS[cat]}</span>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                        {categoryCounts[cat]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-lg">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Szukaj lokalu po nazwie lub ulicy w Knurowie"
                    placeholder="Szukaj po nazwie lub ulicy (np. Szpitalna, Lidl, Szczygłowice)..."
                    className="w-full rounded-lg border border-[#27272a] bg-[#18181b] pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyEstablished((v) => !v)}
                  aria-pressed={onlyEstablished}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    onlyEstablished
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                      : 'border-[#27272a] bg-[#18181b] text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Tylko powyżej {BAYES_MINIMUM_VOTES_M} głosów</span>
                </button>
              </div>
            </div>

            {needsSqlMigration && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-zinc-300">
                  <p>
                    W bazie Supabase jest teraz{' '}
                    <span className="font-mono font-semibold text-amber-300">
                      {places.length}
                    </span>{' '}
                    miejsc. Dostępna jest aktualizacja kategorii i katalogu
                    (125+ lokali, osobne TOP 10:{' '}
                    <strong className="text-zinc-100">
                      Restauracje i Bistra
                    </strong>
                    ,{' '}
                    <strong className="text-zinc-100">
                      Kawiarnie i Cukiernie
                    </strong>
                    ,{' '}
                    <strong className="text-zinc-100">Markety i Sklepy</strong>{' '}
                    oraz nowe salony fryzjerskie m.in. Axiniia).
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('sql')}
                    className="rounded-lg border border-amber-500/50 bg-[#18181b] px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors whitespace-nowrap shrink-0"
                  >
                    Pokaż kod aktualizacji SQL
                  </button>
                </div>
              )}

            {/* Ranking List Container */}
            <div className="rounded-xl border border-[#27272a] bg-[#18181b] overflow-hidden">
              {loading ? (
                <div className="divide-y divide-[#27272a]">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="px-6 py-5 flex items-center justify-between animate-pulse"
                    >
                      <div className="space-y-2 w-2/3">
                        <div className="h-4 bg-zinc-800 rounded w-1/3" />
                        <div className="h-3 bg-zinc-800/70 rounded w-1/2" />
                      </div>
                      <div className="h-6 bg-zinc-800 rounded w-20" />
                    </div>
                  ))}
                </div>
              ) : loadError ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-rose-400">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => void fetchInitialData()}
                    className="rounded-lg border border-[#27272a] px-4 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500"
                  >
                    Spróbuj ponownie
                  </button>
                </div>
              ) : displayedPlaces.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-zinc-300">
                    Brak lokali spełniających wybrane kryteria w Knurowie.
                  </p>
                  <p className="text-xs text-zinc-500">
                    Zmień frazę wyszukiwania lub zgłoś brakujące miejsce do rankingu.
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('wszystkie');
                        setOnlyEstablished(false);
                      }}
                      className="rounded-lg border border-[#27272a] px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white"
                    >
                      Wyczyść filtry
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddPlaceOpen(true)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Zgłoś nowy lokal
                    </button>
                  </div>
                </div>
              ) : (
                <div data-testid="ranking-list">
                  {displayedPlaces.map((place, idx) => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      displayRank={
                        selectedCategory === 'wszystkie' ? place.rank : idx + 1
                      }
                      onSelect={(p) => setSelectedPlaceId(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {!loading && !loadError && filteredPlaces.length > 10 && (
              <div className="flex items-center justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowAllPlaces((v) => !v)}
                  className="rounded-lg border border-[#27272a] bg-[#18181b] px-5 py-2.5 text-xs font-medium text-zinc-200 hover:border-emerald-500 hover:text-white transition-colors"
                >
                  {showAllPlaces
                    ? 'Pokaż tylko TOP 10'
                    : `Pokaż wszystkie lokale (${filteredPlaces.length})`}
                </button>
              </div>
            )}
          </section>
        )}

        {activeSection === 'gps' && (
          <GpsStatusPanel
            gps={gps}
            canSimulateGps={!isSupabaseConfigured}
            onRequestGps={handleRequestGps}
            onSimulateCoords={applyCoordinates}
          />
        )}

        {activeSection === 'maps' && <MapsExplorerPanel places={places} />}

        {activeSection === 'sql' && showSqlTools && <SqlSchemaPanel />}
      </main>

      <footer className="border-t border-[#27272a] py-6 text-xs text-zinc-500">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            OcenaKnurów – TOP 10 · Algorytm średniej ważonej Bayesa (m ={' '}
            {BAYES_MINIMUM_VOTES_M})
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Strefa weryfikacji lokalnej: 10 km od centrum Knurowa (50.2225° N,
              18.6708° E)
            </span>
            {showSqlTools && (
              <button
                type="button"
                onClick={() => setActiveSection('sql')}
                className="text-zinc-400 hover:text-emerald-400 underline underline-offset-4 transition-colors"
              >
                Konfiguracja bazy SQL
              </button>
            )}
          </div>
        </div>
      </footer>

      <PlaceDetailModal
        place={selectedPlace}
        globalMeanC={globalMeanC}
        user={user}
        rateLimit={rateLimit}
        gps={gps}
        canSimulateGps={!isSupabaseConfigured}
        onRequestGps={handleRequestGps}
        onSimulateCoords={applyCoordinates}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onClose={() => setSelectedPlaceId(null)}
        onReviewSaved={(payload) => {
          setPlaces(payload.places);
          setGlobalMeanC(payload.globalMeanC);
          setTotalReviews(payload.totalReviews);
          setRateLimit(payload.rateLimit);
        }}
      />

      <AddPlaceModal
        isOpen={isAddPlaceOpen}
        user={user}
        onClose={() => setIsAddPlaceOpen(false)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onPlaceAdded={(payload) => {
          setPlaces(payload.places);
          setGlobalMeanC(payload.globalMeanC);
          setTotalReviews(payload.totalReviews);
        }}
      />

      <GoogleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(signedUser, quota) => {
          setUser(signedUser);
          setRateLimit(quota);
        }}
      />
    </div>
  );
}
