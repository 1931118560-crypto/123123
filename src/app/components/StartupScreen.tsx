import { motion } from 'motion/react';

export function StartupScreen() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(247,240,192,0.96) 58%, rgba(255,215,154,0.92) 100%)'
        }}
      />

      <motion.div
        initial={{ opacity: 0.24, scale: 0.92 }}
        animate={{ opacity: 0.9, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="absolute left-1/2 top-[16%] h-[360px] w-[360px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,225,125,0.24) 58%, rgba(255,225,125,0) 100%)'
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
        <motion.div
          initial={{ y: 10, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.68, ease: 'easeOut' }}
          className="w-full max-w-[280px] rounded-[26px] px-7 py-9"
          style={{
            background: 'rgba(255,255,255,0.62)',
            border: '1px solid rgba(194,123,108,0.2)',
            boxShadow: '0 16px 30px rgba(60,56,53,0.1)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <div className="mx-auto w-[86px] h-[30px] flex items-center justify-center gap-[6px]">
            <div className="h-[18px] w-[18px] rounded-[6px]" style={{ background: 'rgba(111,106,85,0.26)' }} />
            <div className="h-[18px] w-[18px] rounded-[6px]" style={{ background: 'rgba(255,225,125,0.58)' }} />
            <div className="h-[18px] w-[18px] rounded-[6px]" style={{ background: 'rgba(111,106,85,0.26)' }} />
          </div>

          <p
            className="mt-5 text-center tracking-[0.18em]"
            style={{ color: 'var(--charcoal)', fontSize: 21, fontWeight: 720 }}
          >
            MINDPLAN
          </p>
          <p
            className="mt-2 text-center tracking-[0.05em]"
            style={{ color: 'var(--warm-grey)', fontSize: 12, fontWeight: 580 }}
          >
            Breathe. Settle. Begin.
          </p>
        </motion.div>
      </div>

      <div className="absolute bottom-16 left-1/2 w-[156px] -translate-x-1/2">
        <div className="h-[2px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(111,106,85,0.2)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, rgba(255,196,124,0.95) 0%, rgba(194,123,108,0.9) 100%)' }}
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.08 }}
          />
        </div>
      </div>
    </div>
  );
}
