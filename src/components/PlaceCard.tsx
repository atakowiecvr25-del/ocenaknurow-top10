import { AlertCircle, ChevronRight, ShieldCheck, Star } from 'lucide-react';
import { CATEGORY_LABELS, formatPolishVotes } from '../lib/ranking';
import type { RankedPlace } from '../types';
import { RatingDistributionBars } from './RatingDistributionBars';

interface PlaceCardProps {
  place: RankedPlace;
  displayRank?: number;
  onSelect: (place: RankedPlace) => void;
}

export function PlaceCard({ place, displayRank, onSelect }: PlaceCardProps) {
  const effectiveRank = displayRank ?? place.rank;
  const isTopThree = effectiveRank <= 3;

  return (
    <article className="group border-b border-[#27272a] last:border-b-0 transition-colors hover:bg-zinc-900/60">
      <button
        type="button"
        onClick={() => onSelect(place)}
        className="w-full text-left px-4 py-4 sm:px-6 sm:py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
      >
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {/* Rank number */}
          <div className="w-10 shrink-0 pt-0.5">
            <span
              className={`font-mono text-lg font-bold tabular-nums ${
                isTopThree ? 'text-amber-400' : 'text-zinc-500'
              }`}
            >
              #{effectiveRank}
            </span>
          </div>

          {/* Place details & unboxed metadata */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-base sm:text-lg font-semibold text-zinc-100 group-hover:text-white transition-colors">
                {place.name}
              </h3>
              {place.verifiedVotes > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Zweryfikowano w Knurowie</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-zinc-400">
              <span className="font-medium text-zinc-300">
                {CATEGORY_LABELS[place.category]}
              </span>
              <span aria-hidden="true" className="text-zinc-600">
                ·
              </span>
              <span>{place.address}</span>
              {place.tags.length > 0 && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline text-zinc-600">
                    ·
                  </span>
                  <span className="basis-full sm:basis-auto text-zinc-500">
                    {place.tags.join(' · ')}
                  </span>
                </>
              )}
            </div>

            {place.isProvisional && (
              <p className="inline-flex items-center gap-1.5 text-xs text-amber-400/90 pt-0.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Mało głosów – pozycja tymczasowa</span>
              </p>
            )}
          </div>
        </div>

        {/* Right metrics: Mini histogram + Bayes Score + Votes */}
        <div className="flex items-center justify-between sm:justify-end gap-6 pl-14 sm:pl-0 shrink-0">
          <div className="hidden lg:block">
            <RatingDistributionBars distribution={place.ratingDistribution} compact />
          </div>

          <div className="text-left sm:text-right">
            <div className="inline-flex items-center gap-1.5 font-mono text-lg sm:text-xl font-bold tabular-nums text-amber-400">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span>{place.bayesScore.toFixed(2)}</span>
              <span className="text-xs font-normal text-zinc-500">/10</span>
            </div>
            <div className="text-xs font-mono tabular-nums text-zinc-400">
              {formatPolishVotes(place.verifiedVotes)}
              {place.rawAverage !== null && (
                <span className="text-zinc-500">
                  {' '}
                  · śr. {place.rawAverage.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <ChevronRight
            className="h-4 w-4 text-zinc-500 group-hover:text-zinc-200 transition-colors shrink-0"
            aria-hidden="true"
          />
        </div>
      </button>
    </article>
  );
}
