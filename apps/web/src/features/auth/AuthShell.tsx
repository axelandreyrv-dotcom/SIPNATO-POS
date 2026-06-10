import type { ReactNode } from 'react';

interface AuthShellProps {
  children: ReactNode;
}

function DotGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    />
  );
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-[100dvh] w-full">
      {/* ── Brand panel (desktop only) ─────────────────────────────── */}
      <aside className="relative hidden w-[400px] shrink-0 flex-col justify-between overflow-hidden bg-brand-navy p-12 lg:flex">
        <DotGrid />

        {/* Wordmark */}
        <div className="relative z-10">
          <div className="mb-2 flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-bold tracking-widest text-white"
              aria-hidden
            >
              S
            </span>
            <span className="text-lg font-semibold tracking-tight text-white">SIPNATO</span>
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-white/40">
            POS
          </p>
        </div>

        {/* Center decorative tagline */}
        <div className="relative z-10 space-y-2">
          <p className="text-2xl font-semibold leading-tight tracking-tight text-white">
            Tu taller,<br />tu sistema.
          </p>
          <p className="text-sm text-white/50">
            Gestión de ventas, caja y clientes en un solo lugar.
          </p>
        </div>

        {/* Footer detail */}
        <p className="relative z-10 text-xs text-white/25">
          Costa Rica · SIPNATO POS
        </p>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col items-center justify-center bg-surface-bg px-6 py-12">
        {/* Mobile brand strip */}
        <div className="mb-10 flex items-center gap-2 lg:hidden">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-navy text-xs font-bold tracking-widest text-white"
            aria-hidden
          >
            S
          </span>
          <span className="text-base font-semibold tracking-tight text-text-primary">
            SIPNATO POS
          </span>
        </div>

        <div className="w-full max-w-[360px]">{children}</div>
      </main>
    </div>
  );
}
