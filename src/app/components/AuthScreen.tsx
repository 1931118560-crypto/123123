import { getPrivacyPolicyUrl, getTermsOfServiceUrl } from '../../config/legal';

type AuthScreenProps = {
  busyMode: 'apple' | 'guest' | null;
  errorMessage: string | null;
  onAppleSignIn: () => void | Promise<void>;
  onGuestContinue: () => void | Promise<void>;
};

export function AuthScreen({
  busyMode,
  errorMessage,
  onAppleSignIn,
  onGuestContinue
}: AuthScreenProps) {
  const PRIVACY_URL = getPrivacyPolicyUrl();
  const TERMS_URL = getTermsOfServiceUrl();
  const openExternal = (url: string) => {
    if (typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const busy = busyMode !== null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-24 left-1/2 h-[340px] w-[340px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,225,125,0.24) 56%, rgba(255,225,125,0) 100%)'
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(247,240,192,0.95) 54%, rgba(255,215,154,0.93) 100%)'
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <div
          className="w-full max-w-[348px] rounded-[30px] p-6"
          style={{
            background: 'rgba(255,255,255,0.62)',
            border: '1px solid rgba(194,123,108,0.24)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 14px 28px rgba(60,56,53,0.12)'
          }}
        >
          <div className="text-center">
            <div className="mx-auto w-[82px] h-[26px] flex items-center justify-center gap-[6px]">
              <div className="h-[14px] w-[14px] rounded-[5px]" style={{ background: 'rgba(111,106,85,0.24)' }} />
              <div className="h-[14px] w-[14px] rounded-[5px]" style={{ background: 'rgba(255,225,125,0.55)' }} />
              <div className="h-[14px] w-[14px] rounded-[5px]" style={{ background: 'rgba(111,106,85,0.24)' }} />
            </div>
            <h1 className="mt-3" style={{ color: 'var(--charcoal)', fontSize: 25, fontWeight: 720 }}>
              Welcome to MindPlan
            </h1>
            <p className="mt-2" style={{ color: 'var(--warm-grey)', fontSize: 13, lineHeight: 1.58 }}>
              Continue with Apple for account sync and purchase restoration.
              You can also enter as a guest.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <span className="px-2.5 py-1 rounded-full" style={{ fontSize: 11, color: 'var(--warm-grey)', background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(111,106,85,0.2)' }}>Private</span>
              <span className="px-2.5 py-1 rounded-full" style={{ fontSize: 11, color: 'var(--warm-grey)', background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(111,106,85,0.2)' }}>Secure</span>
              <span className="px-2.5 py-1 rounded-full" style={{ fontSize: 11, color: 'var(--warm-grey)', background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(111,106,85,0.2)' }}>Cross-device</span>
            </div>
          </div>

          <button
            type="button"
            className="mt-6 w-full h-12 rounded-2xl flex items-center justify-center gap-2"
            style={{
              background: '#111111',
              color: '#ffffff',
              fontWeight: 650,
              boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
              opacity: busy ? 0.72 : 1
            }}
            disabled={busy}
            onClick={onAppleSignIn}
          >
            <svg width="14" height="17" viewBox="0 0 14 17" fill="none" aria-hidden="true">
              <path
                d="M9.8 2.7C10.5 1.9 11 0.9 10.8 0C9.8 0.1 8.7 0.7 8 1.4C7.4 2 6.8 3.1 7.1 4C8.2 4.1 9.1 3.5 9.8 2.7ZM13.9 12.3C13.7 12.9 13.4 13.5 13 14C12.4 14.9 11.7 16 10.6 16C9.7 16 9.5 15.4 8.2 15.4C6.9 15.4 6.6 16 5.7 16C4.6 16 3.8 14.9 3.2 14.1C1.4 11.6 0.1 7.1 2 4.5C2.9 3.2 4.4 2.4 5.8 2.4C6.9 2.4 7.9 3.1 8.5 3.1C9.1 3.1 10.4 2.3 11.7 2.4C12.2 2.4 13.6 2.6 14.5 4C14.4 4.1 12.8 5 12.8 7C12.8 9.4 14.9 10.2 14.9 10.2C14.9 10.3 14.6 11.2 13.9 12.3Z"
                fill="currentColor"
              />
            </svg>
            <span>{busyMode === 'apple' ? 'Signing in...' : 'Sign in with Apple'}</span>
          </button>

          <button
            type="button"
            className="mt-3 w-full h-11 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.42)',
              border: '1px solid rgba(194,123,108,0.3)',
              color: 'var(--warm-grey)',
              fontSize: 14,
              fontWeight: 620,
              opacity: busy ? 0.65 : 1
            }}
            disabled={busy}
            onClick={onGuestContinue}
          >
            {busyMode === 'guest' ? 'Entering...' : 'Continue as Guest'}
          </button>

          {errorMessage ? (
            <p className="mt-3 text-center" style={{ color: 'var(--terracotta)', fontSize: 12, lineHeight: 1.45 }}>
              {errorMessage}
            </p>
          ) : null}

          <p className="mt-4 text-center" style={{ color: 'var(--warm-grey)', fontSize: 11, lineHeight: 1.52 }}>
            By continuing, you agree to our
            <button
              type="button"
              onClick={() => openExternal(TERMS_URL)}
              className="ml-1 underline"
              style={{ color: 'var(--charcoal)', fontWeight: 600 }}
            >
              Terms
            </button>
            and
            <button
              type="button"
              onClick={() => openExternal(PRIVACY_URL)}
              className="ml-1 underline"
              style={{ color: 'var(--charcoal)', fontWeight: 600 }}
            >
              Privacy Policy
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
