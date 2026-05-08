import { motion } from 'motion/react';

type MembershipBadgeProps = {
  pro: boolean;
  onClick?: () => void;
};

export function MembershipBadge({ pro, onClick }: MembershipBadgeProps) {
  return (
    <motion.button
      onClick={onClick}
      className="absolute top-5 left-24 z-10 px-1.5 h-8 rounded-full flex items-center gap-0.5"
      style={{
        background: pro
          ? 'linear-gradient(135deg, rgba(212, 175, 106, 0.36) 0%, rgba(194, 123, 108, 0.22) 55%, rgba(255, 255, 255, 0.10) 100%)'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.62) 0%, var(--surface-70) 72%)',
        border: pro ? '1px solid rgba(212, 175, 106, 0.70)' : '1px solid var(--warm-grey-30)',
        backdropFilter: 'blur(18px)',
        boxShadow: pro
          ? '0 18px 46px rgba(60, 56, 53, 0.20), inset 0 1px 2px rgba(255, 255, 255, 0.62)'
          : '0 12px 30px rgba(60, 56, 53, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.58)',
        color: 'var(--charcoal)',
        cursor: onClick ? 'pointer' : 'default',
        transform: onClick ? 'translateZ(0)' : undefined
      }}
      disabled={!onClick}
      aria-label={pro ? 'Pro member' : 'Free member'}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: pro
            ? 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 100%)'
            : 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)',
          opacity: 0.75
        }}
        animate={{ x: ['-140%', '140%'] }}
        transition={{ duration: pro ? 2.8 : 3.4, repeat: Infinity, ease: 'linear' }}
      />

      <motion.div
        className="absolute -inset-0.5 rounded-full pointer-events-none"
        style={{
          border: pro ? '1px solid rgba(212, 175, 106, 0.35)' : '1px solid rgba(155, 149, 143, 0.22)',
          filter: pro ? 'blur(0.2px) drop-shadow(0 0 14px rgba(212,175,106,0.28))' : 'blur(0.2px) drop-shadow(0 0 10px rgba(155,149,143,0.18))',
          opacity: 0.85
        }}
        animate={pro ? { opacity: [0.75, 0.95, 0.75] } : { opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: pro ? 2.6 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      <span
        className="w-5 h-5 rounded-full flex items-center justify-center relative"
        style={{
          background: pro
            ? 'linear-gradient(135deg, rgba(212, 175, 106, 0.95) 0%, rgba(194, 123, 108, 0.95) 100%)'
            : 'linear-gradient(135deg, rgba(155, 149, 143, 0.26) 0%, rgba(155, 149, 143, 0.12) 100%)',
          border: pro ? 'none' : '1px solid rgba(155, 149, 143, 0.35)',
          boxShadow: pro ? '0 14px 24px rgba(194, 123, 108, 0.24)' : '0 10px 16px rgba(60, 56, 53, 0.10)',
          color: pro ? 'var(--surface-95)' : 'var(--warm-grey)'
        }}
      >
        {pro ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3.5l2.7 5.6 6.2.9-4.5 4.3 1.1 6.1L12 17.8 6.5 20.4l1.1-6.1-4.5-4.3 6.2-.9L12 3.5Z"
              fill="currentColor"
              opacity="0.95"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path
              d="M17 11V8.5a5 5 0 0 0-10 0V11"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M8 11h8a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-5a2 2 0 0 1 2-2Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      <span className="flex items-baseline gap-0.5">
        <span style={{ fontSize: 10, fontWeight: 850, letterSpacing: '0.08em', color: pro ? 'var(--charcoal)' : 'var(--warm-grey)' }}>
          {pro ? 'PRO' : 'FREE'}
        </span>
        <span style={{ fontSize: 10, fontWeight: 740, color: 'var(--charcoal)' }}>
          {pro ? 'Member' : 'Guest'}
        </span>
      </span>

      {!pro && onClick ? (
        <span className="ml-0.5" style={{ color: 'var(--warm-grey)' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </motion.button>
  );
}
