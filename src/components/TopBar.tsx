import { LogOut, UserCheck } from 'lucide-react';
import type { ActiveNavSection, AuthUser } from '../types';

interface TopBarProps {
  activeSection: ActiveNavSection;
  onSelectSection: (section: ActiveNavSection) => void;
  user: AuthUser | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export function TopBar({
  activeSection,
  onSelectSection,
  user,
  onOpenAuth,
  onLogout,
}: TopBarProps) {
  const navItems: { id: ActiveNavSection; label: string }[] = [
    { id: 'ranking', label: 'Ranking' },
    { id: 'gps', label: 'Strefa GPS' },
    { id: 'maps', label: 'Szukaj w Mapach' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#27272a] bg-[#09090b]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectSection('ranking')}
          className="whitespace-nowrap shrink-0 text-left text-lg font-bold tracking-tight text-zinc-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          OcenaKnurów
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Nawigacja główna"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive
                    ? 'border-emerald-500 text-zinc-100'
                    : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              title={`Zalogowano jako ${user.email} — kliknij, aby wylogować`}
              className="inline-flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#18181b] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-600 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <UserCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
              <span className="max-w-[130px] truncate">{user.name}</span>
              <LogOut className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Zaloguj przez Google
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile navigation row keeping aggregate height < 15% */}
      <nav
        aria-label="Nawigacja mobilna"
        className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-[#27272a] px-4 py-2 text-xs font-medium"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`whitespace-nowrap shrink-0 py-0.5 ${
                isActive ? 'text-emerald-400 font-semibold' : 'text-zinc-400'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
