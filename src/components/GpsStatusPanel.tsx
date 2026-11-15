import { useState } from 'react';
import { LocateFixed, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  KNUROW_CENTER,
  MAX_VERIFIED_DISTANCE_KM,
  verifyKnurowLocation,
} from '../lib/geo';
import type { GpsState } from '../types';

interface GpsStatusPanelProps {
  gps: GpsState;
  canSimulateGps: boolean;
  onRequestGps: () => void;
  onSimulateCoords: (lat: number, lng: number) => void;
}

export function GpsStatusPanel({
  gps,
  canSimulateGps,
  onRequestGps,
  onSimulateCoords,
}: GpsStatusPanelProps) {
  const [customLat, setCustomLat] = useState('50.2225');
  const [customLng, setCustomLng] = useState('18.6708');

  const previewCheck = (() => {
    const lat = Number(customLat);
    const lng = Number(customLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return verifyKnurowLocation(lat, lng);
  })();

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#27272a] pb-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100">
              Weryfikacja geolokalizacji Haversine (GPS)
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              System blokuje głosy spoza promienia{' '}
              <span className="font-mono text-zinc-200 tabular-nums">
                {MAX_VERIFIED_DISTANCE_KM} km
              </span>{' '}
              od centrum Knurowa (
              <span className="font-mono text-zinc-300 tabular-nums">
                {KNUROW_CENTER.lat}° N, {KNUROW_CENTER.lng}° E
              </span>
              ), obejmując Knurów, Szczygłowice, Gierałtowice i Pilchowice.
            </p>
          </div>

          <button
            type="button"
            onClick={onRequestGps}
            disabled={gps.status === 'locating'}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
          >
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            <span>
              {gps.status === 'locating'
                ? 'Pobieranie GPS...'
                : 'Sprawdź moją lokalizację'}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4">
            <div className="text-xs text-zinc-500">Status przeglądarki</div>
            <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
              {gps.status === 'verified' ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  <span className="text-emerald-400">Zweryfikowano w Knurowie</span>
                </>
              ) : gps.status === 'rejected' ? (
                <>
                  <ShieldAlert className="h-4 w-4 text-rose-400" aria-hidden="true" />
                  <span className="text-rose-400">Poza strefą 10 km</span>
                </>
              ) : gps.status === 'error' ? (
                <span className="text-amber-400">Brak zgody na GPS</span>
              ) : (
                <span className="text-zinc-300">Oczekuje na sprawdzenie</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4">
            <div className="text-xs text-zinc-500">Odległość od centrum</div>
            <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-zinc-100">
              {gps.distanceKm !== null ? `${gps.distanceKm.toFixed(2)} km` : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4">
            <div className="text-xs text-zinc-500">Rozpoznana strefa</div>
            <div className="mt-1.5 text-sm font-medium text-zinc-200">
              {gps.zoneLabel ?? 'Nie określono'}
            </div>
          </div>
        </div>

        {gps.errorMessage && (
          <p role="alert" className="text-xs text-rose-400">
            {gps.errorMessage}
          </p>
        )}
      </div>

      {/* Interactive Haversine distance calculator (simulation disabled in live production mode) */}
      <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-6 space-y-4">
        <h3 className="text-base font-semibold text-zinc-100">
          {canSimulateGps
            ? 'Kalkulator i symulator strefy 10 km'
            : 'Kalkulator zasięgu strefy 10 km'}
        </h3>
        <p className="text-xs text-zinc-400">
          {canSimulateGps
            ? 'Sprawdź działanie wzoru Haversine\u2019a dla przykładowych miejscowości lub własnych współrzędnych GPS.'
            : 'Sprawdź, czy dana miejscowość lub punkt mieści się w dopuszczalnym promieniu 10 km od centrum Knurowa (głosowanie wymaga prawdziwego GPS przeglądarki).'}
        </p>

        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Knurów Rynek', lat: 50.2225, lng: 18.6708 },
            { label: 'Szczygłowice', lat: 50.1947, lng: 18.6368 },
            { label: 'Gierałtowice', lat: 50.2271, lng: 18.7385 },
            { label: 'Pilchowice', lat: 50.2141, lng: 18.5675 },
            { label: 'Katowice Centrum (blokada)', lat: 50.2649, lng: 19.0238 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setCustomLat(String(preset.lat));
                setCustomLng(String(preset.lng));
                if (canSimulateGps) {
                  onSimulateCoords(preset.lat, preset.lng);
                }
              }}
              className="rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-emerald-500 hover:text-white transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-2">
          <div>
            <label
              htmlFor="calc-lat"
              className="block text-xs font-medium text-zinc-400 mb-1"
            >
              Szerokość geograficzna (lat)
            </label>
            <input
              id="calc-lat"
              type="number"
              step="0.0001"
              value={customLat}
              onChange={(e) => setCustomLat(e.target.value)}
              className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 font-mono text-sm text-zinc-100"
            />
          </div>
          <div>
            <label
              htmlFor="calc-lng"
              className="block text-xs font-medium text-zinc-400 mb-1"
            >
              Długość geograficzna (lng)
            </label>
            <input
              id="calc-lng"
              type="number"
              step="0.0001"
              value={customLng}
              onChange={(e) => setCustomLng(e.target.value)}
              className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 font-mono text-sm text-zinc-100"
            />
          </div>
          {canSimulateGps && (
            <button
              type="button"
              onClick={() => {
                const lat = Number(customLat);
                const lng = Number(customLng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                  onSimulateCoords(lat, lng);
                }
              }}
              className="rounded-lg border border-[#27272a] bg-[#09090b] px-4 py-2 text-xs font-semibold text-zinc-100 hover:border-emerald-500 transition-colors h-[38px]"
            >
              Zastosuj współrzędne
            </button>
          )}
        </div>

        {previewCheck && (
          <p className="text-xs font-mono tabular-nums text-zinc-300 pt-1">
            Wynik Haversine: {previewCheck.distanceKm.toFixed(2)} km ·{' '}
            <span
              className={
                previewCheck.isLocalVerified
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }
            >
              {previewCheck.isLocalVerified
                ? 'Dozwolone do głosowania'
                : 'Zablokowane (> 10 km)'}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
