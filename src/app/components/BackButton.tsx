type BackButtonProps = {
  onClick: () => void;
};

export function BackButton({ onClick }: BackButtonProps) {
  return (
    <button
      onClick={onClick}
      className="absolute top-5 left-3 z-30 w-9 h-9 rounded-full flex items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(246,241,234,0.33) 100%)',
        border: '1px solid rgba(78, 72, 66, 0.16)',
        backdropFilter: 'blur(16px)',
        boxShadow:
          '0 7px 16px rgba(38, 34, 31, 0.11), 0 0 0 1px rgba(255,255,255,0.2), inset 0 1px 2px rgba(255, 255, 255, 0.38)',
        color: 'var(--charcoal)',
        opacity: 0.65
      }}
      aria-label="Back"
    >
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" style={{ filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.28))', opacity: 0.83 }}>
        <path
          d="M11.5 6.5L8.2 10l3.3 3.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
