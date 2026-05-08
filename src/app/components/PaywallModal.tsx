import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { logEvent } from '../../services/telemetry';
import { isRevenueCatNativeSupported, purchaseProMonthly, restorePurchases } from '../../services/revenuecat';
import { getPrivacyPolicyUrl, getSubscriptionTermsUrl, getTermsOfServiceUrl } from '../../config/legal';

type PaywallModalProps = {
  open: boolean;
  onClose: () => void;
  source?: string;
  onMembershipChanged?: () => void | Promise<void>;
};

export function PaywallModal({ open, onClose, source, onMembershipChanged }: PaywallModalProps) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const canUseNativeBilling = isRevenueCatNativeSupported();
  const PRIVACY_URL = getPrivacyPolicyUrl();
  const TERMS_URL = getTermsOfServiceUrl();
  const SUBSCRIPTION_TERMS_URL = getSubscriptionTermsUrl();

  const openExternal = (url: string) => {
    if (typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (open) logEvent('paywall_open', { source: source ?? 'unknown' });
  }, [open, source]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full max-w-[360px] rounded-3xl p-6"
            style={{
              background: 'rgba(255, 255, 255, 0.54)',
              border: '1px solid var(--warm-grey-30)',
              backdropFilter: 'blur(14px)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div style={{ color: 'var(--charcoal)', fontSize: 18, fontWeight: 650 }}>MindPlan Pro</div>
                <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 13 }}>
                  More personalized, deeper, and more reliable sessions.
                </div>
              </div>
              <button
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ border: '1px solid var(--warm-grey-30)', color: 'var(--warm-grey)' }}
                onClick={onClose}
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {[
                'Unlimited personalized meditation generation',
                'Longer sessions and premium voice styles',
                'History and preferences (coming soon)',
              ].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <div className="mt-[3px] w-4 h-4 rounded-full" style={{ background: 'var(--accent-10)', border: '1px solid var(--warm-grey-30)' }} />
                  <div style={{ color: 'var(--charcoal)', fontSize: 14, lineHeight: 1.5 }}>{t}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl p-4" style={{ background: 'rgba(248, 242, 236, 0.46)', border: '1px solid var(--warm-grey-30)' }}>
              <div className="flex items-center justify-between">
                <div style={{ color: 'var(--charcoal)', fontWeight: 650 }}>Monthly Plan</div>
                <div style={{ color: 'var(--charcoal)', fontWeight: 650 }}>$7.99</div>
              </div>
              <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                7-day free trial, then $7.99/month. Cancel anytime.
              </div>
            </div>

            <button
              className="mt-5 w-full h-12 rounded-2xl"
              style={{
                background: 'var(--terracotta)',
                color: 'var(--surface-95)',
                fontWeight: 650,
                opacity: busy ? 0.7 : 1
              }}
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                if (!canUseNativeBilling) {
                  setHint('Purchases are available only in the iOS app build (Apple In-App Purchase).');
                  return;
                }
                setBusy(true);
                setHint(null);
                logEvent('paywall_purchase_intent', { plan: 'pro_monthly', source: source ?? 'unknown' });
                try {
                  await purchaseProMonthly();
                  await onMembershipChanged?.();
                  logEvent('purchase_attempt', { provider: 'revenuecat', plan: 'pro_monthly', ok: true });
                  setHint('Purchase successful. Your Pro status is now active.');
                } catch (e) {
                  logEvent('purchase_attempt', { provider: 'revenuecat', plan: 'pro_monthly', ok: false, message: String(e) });
                  setHint('Purchase was not completed. Please retry in the iOS app.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Processing…' : 'Start Free Trial'}
            </button>
            <button
              className="mt-3 w-full h-10 rounded-xl"
              style={{
                background: 'transparent',
                border: '1px solid var(--warm-grey-30)',
                color: 'var(--warm-grey)',
                fontSize: 14,
                opacity: busy ? 0.6 : 1
              }}
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                if (!canUseNativeBilling) {
                  setHint('Restore is available only in the iOS app build.');
                  return;
                }
                setBusy(true);
                setHint(null);
                try {
                  await restorePurchases();
                  await onMembershipChanged?.();
                  setHint('Restore requested. Your Pro status should refresh shortly.');
                } catch (e) {
                  setHint('Restore failed. Please try again later.');
                  logEvent('restore_attempt', { ok: false, message: String(e) });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restore Purchases
            </button>
            {hint ? (
              <div className="mt-3 text-center" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                {hint}
              </div>
            ) : null}
            <div className="mt-3 text-center" style={{ color: 'var(--warm-grey)', fontSize: 12, lineHeight: 1.5 }}>
              Purchases are processed through Apple In-App Purchase on iOS.
              {!canUseNativeBilling ? ' This preview cannot complete purchases.' : ''}
            </div>
            <div className="mt-2 text-center" style={{ color: 'var(--warm-grey)', fontSize: 12, lineHeight: 1.5 }}>
              Auto-renew terms:
              <button
                type="button"
                onClick={() => openExternal(SUBSCRIPTION_TERMS_URL)}
                className="ml-1 underline"
                style={{ color: 'var(--charcoal)' }}
              >
                Subscription Terms
              </button>
            </div>
            <div className="mt-2 text-center" style={{ color: 'var(--warm-grey)', fontSize: 12, lineHeight: 1.5 }}>
              By continuing, you agree to our
              <button
                type="button"
                onClick={() => openExternal(TERMS_URL)}
                className="ml-1 underline"
                style={{ color: 'var(--charcoal)' }}
              >
                Terms of Service
              </button>
              and
              <button
                type="button"
                onClick={() => openExternal(PRIVACY_URL)}
                className="ml-1 underline"
                style={{ color: 'var(--charcoal)' }}
              >
                Privacy Policy
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
