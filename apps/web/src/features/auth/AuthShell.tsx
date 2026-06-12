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
            <img
              src="/favicon.svg"
              alt=""
              width={32}
              height={32}
              aria-hidden
              className="shrink-0"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <span className="text-lg font-semibold tracking-tight text-white">SIPNATO</span>
          </div>
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
          Costa Rica · SIPNATO
        </p>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col items-center justify-center bg-surface-bg px-6 py-12">
        {/* Mobile brand strip */}
        <div className="mb-10 flex items-center gap-2 lg:hidden">
          <img
            src="/favicon.svg"
            alt=""
            width={28}
            height={28}
            aria-hidden
            className="shrink-0"
          />
          <span className="text-base font-semibold tracking-tight text-text-primary">
            SIPNATO
          </span>
        </div>

        <div className="w-full max-w-[360px]">{children}</div>
      </main>
    </div>
  );
}
