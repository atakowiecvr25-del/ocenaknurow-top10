import { useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Map as MapIcon, MapPin, Navigation, Search } from 'lucide-react';
import { KNUROW_CENTER } from '../lib/geo';
import { CATEGORY_LABELS } from '../lib/ranking';
import type { RankedPlace } from '../types';

const QUICK_PROMPTS = [
  'Kebaby w Knurowie',
  'Restauracje i bistra',
  'Kawiarnie i cukiernie',
  'Barber i fryzjer',
  'Dino, Kaufland, ALDI',
  'Pizzerie w Knurowie',
  'Siłownie w Knurowie',
  'Boiska i Orliki',
  'Szczygłowice',
];

interface MapsExplorerPanelProps {
  places?: RankedPlace[];
}

export function MapsExplorerPanel({ places = [] }: MapsExplorerPanelProps) {
  const [query, setQuery] = useState('Kebaby w Knurowie');
  const [showMapPreview, setShowMapPreview] = useState(false);

  const googleMapsSearchUrl = useMemo(() => {
    const trimmed = query.trim();
    const q = trimmed.toLowerCase().includes('knur')
      ? trimmed
      : `${trimmed} Knurów`.trim();
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }, [query]);

  const localMatches = useMemo(() => {
    const tokens = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(
        (w) =>
          w.length >= 2 &&
          ![
            'w',
            'i',
            'z',
            'na',
            'do',
            'knurów',
            'knurowie',
            'knurowa',
            'najwyżej',
            'oceniane',
            'godziny',
            'otwarcia',
            'adres',
            'informacje',
            'sklepy',
          ].includes(w)
      );

    if (tokens.length === 0) return places.slice(0, 12);

    const scored = places
      .map((p) => {
        const haystack = `${p.name} ${CATEGORY_LABELS[p.category]} ${p.address} ${p.tags.join(' ')}`.toLowerCase();
        const hits = tokens.filter((t) => {
          const stem = t.length >= 5 ? t.slice(0, Math.min(t.length - 1, 5)) : t;
          return haystack.includes(t) || haystack.includes(stem);
        }).length;
        return { place: p, hits };
      })
      .filter((item) => item.hits > 0)
      .sort((a, b) => b.hits - a.hits || b.place.bayesScore - a.place.bayesScore);

    return scored.slice(0, 16).map((item) => item.place);
  }, [places, query]);

  const mapFocus = localMatches[0]
    ? { lat: localMatches[0].lat, lng: localMatches[0].lng, label: localMatches[0].name }
    : { lat: KNUROW_CENTER.lat, lng: KNUROW_CENTER.lng, label: 'Centrum Knurowa' };

  const bboxPad = 0.008;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${(
    mapFocus.lng - bboxPad
  ).toFixed(5)},${(mapFocus.lat - bboxPad).toFixed(5)},${(
    mapFocus.lng + bboxPad
  ).toFixed(5)},${(mapFocus.lat + bboxPad).toFixed(5)}&layer=mapnik&marker=${mapFocus.lat},${mapFocus.lng}`;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setShowMapPreview(true);
  }

  return (
    <section className="rounded-xl border border-[#27272a] bg-[#18181b] p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            <span>Wyszukiwarka miejsc na Mapach Google</span>
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Wyszukuj lokale w Knurowie i Szczygłowicach, otwieraj je bezpośrednio
            w Mapach Google oraz wyznaczaj trasę dojazdu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowMapPreview((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:border-emerald-500 hover:text-white transition-colors whitespace-nowrap"
        >
          <MapIcon className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          <span>{showMapPreview ? 'Ukryj mapę' : 'Pokaż mapę okolicy'}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Wyszukaj miejsce lub ulicę w Knurowie"
            placeholder="Wpisz nazwę lokalu, ulicę lub kategorię w Knurowie..."
            className="w-full rounded-lg border border-[#27272a] bg-[#09090b] pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <a
          href={googleMapsSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
        >
          <span>Otwórz w Google Maps</span>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </form>

      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((preset) => {
          const active = query.trim().toLowerCase() === preset.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setQuery(preset)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? 'border-emerald-500/60 bg-emerald-600/15 text-emerald-300'
                  : 'border-[#27272a] bg-[#09090b] text-zinc-300 hover:border-emerald-500 hover:text-white'
              }`}
            >
              {preset}
            </button>
          );
        })}
      </div>

      {showMapPreview && (
        <div className="space-y-2 border-t border-[#27272a] pt-4">
          <p className="text-xs text-zinc-400">
            Podgląd lokalizacji: <span className="text-zinc-200 font-medium">{mapFocus.label}</span>
          </p>
          <div className="overflow-hidden rounded-lg border border-[#27272a] bg-[#09090b]">
            <iframe
              title={`Mapa: ${mapFocus.label}`}
              src={osmEmbedUrl}
              loading="lazy"
              className="h-64 w-full border-0"
            />
          </div>
        </div>
      )}

      {localMatches.length > 0 ? (
        <div className="space-y-3 border-t border-[#27272a] pt-5">
          <h3 className="text-xs font-semibold text-zinc-400">
            Dopasowane miejsca w Knurowie ({localMatches.length})
          </h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {localMatches.map((p) => {
              const q = encodeURIComponent(`${p.name}, ${p.address}`);
              const mapHref = `https://www.google.com/maps/search/?api=1&query=${q}`;
              const dirHref = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
              return (
                <li
                  key={p.id}
                  className="rounded-lg border border-[#27272a] bg-[#09090b] p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-semibold text-zinc-100 truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {CATEGORY_LABELS[p.category]} · {p.address}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 pt-0.5">
                    <a
                      href={dirHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-white whitespace-nowrap"
                    >
                      <Navigation className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                      <span>Trasa</span>
                    </a>
                    <a
                      href={mapHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
                    >
                      <span>Mapa</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="border-t border-[#27272a] pt-5 text-xs text-zinc-400">
          Brak pasujących lokali w lokalnym katalogu dla frazy „{query}” — kliknij{' '}
          <a
            href={googleMapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline hover:text-emerald-300"
          >
            Otwórz w Google Maps
          </a>
          , aby wyszukać bezpośrednio w Mapach Google.
        </div>
      )}
    </section>
  );
}
