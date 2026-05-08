type ProPromoBannerProps = {
  remainingToday?: number;
  onUpgrade: () => void;
};

export function ProPromoBanner({ remainingToday, onUpgrade }: ProPromoBannerProps) {
  return (
    <div
      className="w-full rounded-2xl px-4 py-3 flex items-center justify-between gap-4"
      style={{
        background: 'linear-gradient(135deg, var(--surface-60) 0%, var(--accent-10) 100%)',
        border: '1px solid var(--warm-grey-30)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 10px 30px rgba(60, 56, 53, 0.10), inset 0 1px 2px rgba(255, 255, 255, 0.55)'
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div
            className="px-2 py-0.5 rounded-full"
            style={{ background: 'var(--terracotta)', color: 'var(--surface-95)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}
          >
            PRO
          </div>
          <div style={{ color: 'var(--charcoal)', fontSize: 13, fontWeight: 650 }}>Unlock More Features</div>
        </div>
        <div className="mt-1 truncate" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
          Unlimited sessions · Premium voices · Longer duration
        </div>
        {typeof remainingToday === 'number' ? (
          <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
            Free attempts left today: {Math.max(0, remainingToday)}
          </div>
        ) : null}
      </div>

      <button
        onClick={onUpgrade}
        className="shrink-0 px-4 h-9 rounded-full"
        style={{ background: 'var(--terracotta)', color: 'var(--surface-95)', fontWeight: 650, fontSize: 13 }}
      >
        Try Pro
      </button>
    </div>
  );
}
