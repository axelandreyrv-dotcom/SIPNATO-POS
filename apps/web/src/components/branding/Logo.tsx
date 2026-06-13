interface LogoProps {
  size?: number;
  showText?: boolean;
  onDark?: boolean;
}

export function Logo({ size = 28, showText = true, onDark = true }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo.jpg"
        alt=""
        width={size}
        height={size}
        aria-hidden
        className="shrink-0 rounded-md object-cover"
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
