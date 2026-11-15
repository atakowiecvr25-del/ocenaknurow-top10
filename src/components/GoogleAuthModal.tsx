import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { isSupabaseConfigured, signInWithGoogleSupabase } from '../lib/supabase';
import type { AuthUser, RateLimitStatus } from '../types';

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, rateLimit: RateLimitStatus) => void;
}

const PRESET_ACCOUNTS = [
  {
    name: 'Marek Kowalski',
    email: 'marek.kowalski.knurow@gmail.com',
  },
  {
    name: 'Karolina Nowak',
    email: 'karolina.nowak.slask@gmail.com',
  },
];

export function GoogleAuthModal({
  isOpen,
  onClose,
  onSuccess,
}: GoogleAuthModalProps) {
  const [name, setName] = useState('Marek Kowalski');
  const [email, setEmail] = useState('marek.kowalski.knurow@gmail.com');
  const [loading, setLoading] = useState(false);
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

  async function handleRealGoogleOAuth() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogleSupabase();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Nie udało się uruchomić logowania Google OAuth.'
      );
      setLoading(false);
    }
  }

  async function signInWithGoogle(selectedName: string, selectedEmail: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/google-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedName,
          email: selectedEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Nie udało się zalogować przez Google.');
        return;
      }
      onSuccess(data.user, data.rateLimit);
      onClose();
    } catch {
      setError('Błąd połączenia z serwerem autoryzacji.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@') || name.trim().length < 2) {
      setError('Podaj prawidłowe imię i adres konta Google.');
      return;
    }
    void signInWithGoogle(name, email);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-auth-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#27272a] bg-[#18181b] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#27272a] pb-4">
          <div>
            <h2
              id="google-auth-title"
              className="text-lg font-semibold text-zinc-100"
            >
              Logowanie przez Google
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Wyłącznie konta Google OAuth — brak rejestracji e-mail/hasło w celu
              ochrony przed multi-kontami.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno logowania"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div className="flex items-start gap-2.5 text-xs text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Każde konto Google może dodać maksymalnie 1 opinię na lokal oraz do
              3 nowych opinii w ciągu 24 godzin.
            </span>
          </div>

          {isSupabaseConfigured ? (
            <div className="space-y-3">
              {error && (
                <p role="alert" className="text-xs text-rose-400">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRealGoogleOAuth()}
                className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {loading
                  ? 'Przekierowanie do Google...'
                  : 'Kontynuuj z kontem Google'}
              </button>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Po kliknięciu nastąpi bezpieczne przekierowanie do logowania
                Google obsługiwane przez Supabase Auth.
              </p>
            </div>
          ) : (
            <>

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-400">
              Wybierz konto Google:
            </p>
            <div className="grid gap-2">
              {PRESET_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => void signInWithGoogle(acc.name, acc.email)}
                  className="flex items-center justify-between rounded-lg border border-[#27272a] bg-[#09090b] px-4 py-2.5 text-left hover:border-emerald-500/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-100">
                      {acc.name}
                    </div>
                    <div className="text-xs font-mono text-zinc-400">
                      {acc.email}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-emerald-400 whitespace-nowrap">
                    Kontynuuj
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 border-t border-[#27272a] pt-4">
            <p className="text-xs font-medium text-zinc-400">
              Lub wpisz własne dane konta Google:
            </p>
            <div>
              <label
                htmlFor="google-name"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Imię i nazwisko
              </label>
              <input
                id="google-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="google-email"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Adres e-mail Google
              </label>
              <input
                id="google-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {loading ? 'Logowanie...' : 'Zaloguj przez Google'}
            </button>
          </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
