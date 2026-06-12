interface LogoProps {
  size?: number;
  showText?: boolean;
  /** Use on dark (navy) backgrounds — inverts the SVG to white */
  onDark?: boolean;
}

export function Logo({ size = 28, showText = true, onDark = true }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/favicon.svg"
        alt=""
        width={size}
        height={size}
        aria-hidden
        className="shrink-0"
        style={onDark ? { filter: 'brightness(0) invert(1)' } : undefined}
      />
      {showText && (
        <span
          className={[
            'text-base font-semibold tracking-tight',
            onDark ? 'text-white' : 'text-text-primary',
          ].join(' ')}
        >
          Dosuxsoft
        </span>
      )}
    </div>
  );
}
