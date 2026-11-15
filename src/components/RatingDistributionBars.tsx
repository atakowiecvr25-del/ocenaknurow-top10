import { formatPolishVotes } from '../lib/ranking';

interface RatingDistributionBarsProps {
  distribution: number[];
  compact?: boolean;
}

export function RatingDistributionBars({
  distribution,
  compact = false,
}: RatingDistributionBarsProps) {
  const maxVal = Math.max(1, ...distribution);
  const total = distribution.reduce((a, b) => a + b, 0);

  return (
    <div
      className="flex flex-col gap-1"
      aria-label={`Rozkład ocen od 1 do 10 dla ${formatPolishVotes(total)}`}
    >
      <div
        className={`flex items-end gap-1 ${
          compact ? 'h-8 w-28' : 'h-20 w-full'
        }`}
      >
        {distribution.map((count, idx) => {
          const score = idx + 1;
          const pct = Math.round((count / maxVal) * 100);
          const barHeight = count === 0 ? 4 : Math.max(16, pct);
          return (
            <div
              key={score}
              className="flex-1 flex flex-col items-center justify-end h-full"
              title={`Ocena ${score}/10: ${formatPolishVotes(count)}`}
            >
              <div
                style={{ height: `${barHeight}%` }}
                className={`w-full rounded-[2px] transition-opacity ${
                  count > 0
                    ? score >= 8
                      ? 'bg-amber-500'
                      : score >= 5
                        ? 'bg-zinc-400'
                        : 'bg-zinc-600'
                    : 'bg-[#27272a]'
                }`}
              />
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-500">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <span key={num} className="flex-1 text-center">
              {num}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
