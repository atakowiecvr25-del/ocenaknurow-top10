import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, MapPin, X } from 'lucide-react';
import { KNUROW_CENTER } from '../lib/geo';
import {
  CATEGORY_LABELS,
  VALID_CATEGORIES,
  validatePlaceInput,
} from '../lib/ranking';
import { insertSupabasePlace, isSupabaseConfigured } from '../lib/supabase';
import type {
  AuthUser,
  PlaceCategory,
  RankedPlace,
  RateLimitStatus,
} from '../types';

interface AddPlaceModalProps {
  isOpen: boolean;
  user: AuthUser | null;
  onClose: () => void;
  onOpenAuth: () => void;
  onPlaceAdded: (payload: {
    places: RankedPlace[];
    globalMeanC: number;
    totalReviews: number;
    rateLimit?: RateLimitStatus | null;
  }) => void;
}

export function AddPlaceModal({
  isOpen,
  user,
  onClose,
  onOpenAuth,
  onPlaceAdded,
}: AddPlaceModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('kebab');
  const [address, setAddress] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mapsQueryParts = [name.trim(), address.trim()].filter(Boolean);
  const directMapsQuery =
    mapsQueryParts.length > 0 ? `${mapsQueryParts.join(', ')}, Knurów` : 'Knurów';
  const directMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    directMapsQuery
  )}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }

    const validation = validatePlaceInput(name, category, address);
    if (!validation.valid) {
      setError(validation.error || 'Sprawdź dane lokalu.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isSupabaseConfigured) {
        const cleanTags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length >= 2 && t.length <= 28);

        const snapshot = await insertSupabasePlace({
          name,
          category,
          address,
          tags: cleanTags,
          lat: KNUROW_CENTER.lat,
          lng: KNUROW_CENTER.lng,
          userId: user.id,
        });
        onPlaceAdded(snapshot);
        setName('');
        setAddress('');
        setTagsInput('');
        onClose();
        return;
      }

      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          address,
          tags: tagsInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Nie udało się dodać lokalu.');
        return;
      }
      onPlaceAdded({
        places: data.places,
        globalMeanC: data.globalMeanC,
        totalReviews: data.totalReviews,
      });
      setName('');
      setAddress('');
      setTagsInput('');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Błąd sieci podczas dodawania lokalu.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-place-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#27272a] bg-[#18181b] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#27272a] pb-4">
          <div>
            <h2
              id="add-place-title"
              className="text-lg font-semibold text-zinc-100"
            >
              Zgłoś nowy lokal w Knurowie
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Nowo dodane miejsce startuje w rankingu ze statusem pozycji
              tymczasowej do czasu zebrania 10 zweryfikowanych głosów.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij formularz zgłoszenia"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {!user ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-zinc-300">
              Zgłaszanie nowych lokali wymaga zalogowania kontem Google, aby
              zapobiec duplikatom i spamowi.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Zaloguj przez Google
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="place-name"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Nazwa lokalu lub placówki
              </label>
              <input
                id="place-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Pizzeria Da Grasso Knurów"
                required
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="place-category"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Kategoria
                </label>
                <select
                  id="place-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PlaceCategory)}
                  className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                >
                  {VALID_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="place-tags"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Tagi (po przecinku)
                </label>
                <input
                  id="place-tags"
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="np. płatność kartą, do 22:00"
                  className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="place-address"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Ulica i numer w Knurowie
              </label>
              <input
                id="place-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="np. ul. Koziełka 4, 44-190 Knurów"
                required
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#27272a] bg-[#09090b] p-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <MapPin className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Sprawdź dokładny adres lokalu w Mapach Google</span>
              </div>
              <a
                href={directMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/25 hover:text-white transition-colors whitespace-nowrap"
              >
                <span>Otwórz w Google Maps</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-400">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#27272a] px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Dodawanie...' : 'Dodaj lokal do rankingu'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
