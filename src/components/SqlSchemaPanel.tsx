import { useEffect, useState } from 'react';
import { Check, Copy, Database } from 'lucide-react';
import adminSqlRaw from '../../supabase/admin_setup.sql?raw';
import migrationSqlRaw from '../../supabase/migration_categories.sql?raw';
import schemaSqlRaw from '../../supabase/schema.sql?raw';

export type SchemaTab = 'migration' | 'admin' | 'full';

interface SqlSchemaPanelProps {
  initialTab?: SchemaTab;
}

export function SqlSchemaPanel({ initialTab = 'migration' }: SqlSchemaPanelProps) {
  const [activeTab, setActiveTab] = useState<SchemaTab>(initialTab);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
    setCopied(false);
  }, [initialTab]);

  const displayedSql =
    activeTab === 'migration'
      ? migrationSqlRaw
      : activeTab === 'admin'
        ? adminSqlRaw
        : schemaSqlRaw;

  async function handleCopy() {
    if (!displayedSql) return;
    try {
      await navigator.clipboard.writeText(displayedSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#27272a] pb-4">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              <span>Baza danych Supabase (aktualizacja katalogu — 125+ miejsc)</span>
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Skopiuj wybrany skrypt i wklej go w Supabase →{' '}
              <span className="font-mono text-zinc-200">SQL Editor</span> →{' '}
              <span className="font-mono text-zinc-200">Run</span>. Możesz
              zaktualizować katalog kategorii, włączyć Panel Admina (lista kont i
              moderacja) albo postawić schemat od zera.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!displayedSql}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Skopiowano kod SQL</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>
                  {activeTab === 'migration'
                    ? 'Kopiuj kod aktualizacji'
                    : activeTab === 'admin'
                      ? 'Kopiuj SQL Panelu Admina'
                      : 'Kopiuj pełny schemat'}
                </span>
              </>
            )}
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Wybór skryptu SQL"
          className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'migration'}
            onClick={() => {
              setActiveTab('migration');
              setCopied(false);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'migration'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Aktualizacja istniejącej bazy (125+ lokali)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'admin'}
            onClick={() => {
              setActiveTab('admin');
              setCopied(false);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'admin'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Panel Admina (konta i moderacja)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'full'}
            onClick={() => {
              setActiveTab('full');
              setCopied(false);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'full'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Pełny schemat od zera
          </button>
        </div>

        <pre className="max-h-[460px] overflow-auto rounded-lg border border-[#27272a] bg-[#09090b] p-4 font-mono text-xs leading-relaxed text-zinc-300">
          {displayedSql}
        </pre>
      </div>
    </section>
  );
}
