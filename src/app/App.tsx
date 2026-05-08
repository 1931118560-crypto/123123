import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { InquiryScreen } from './components/InquiryScreen';
import { MeditationScreen } from './components/MeditationScreen';
import { MySpaceScreen, Settings } from './components/MySpaceScreen';
import { PaywallModal } from './components/PaywallModal';
import { MembershipBadge } from './components/MembershipBadge';
import { BackButton } from './components/BackButton';
import { AuthScreen } from './components/AuthScreen';
import { StartupScreen } from './components/StartupScreen';
import AdminApp from './AdminApp';

import { PlaybackSegment } from '../services/minimax';
import { logEvent, upsertDevice } from '../services/telemetry';
import { beginAppleSignIn, ensureAnonymousSession, getExistingSession, onAuthStateChanged, signInAsGuest } from '../services/auth';
import { fetchMyEntitlements, isPro } from '../services/entitlements';
import { configureRevenueCat, customerHasPro, getRevenueCatCustomerInfo, onCustomerInfoUpdate } from '../services/revenuecat';

type Screen = 'inquiry' | 'meditation' | 'settings';
type AuthState = 'checking' | 'required' | 'ready';

const ALLOWED_THEMES = ['warm', 'sage', 'ocean', 'rose', 'aurora', 'sunset', 'lavender', 'graphite'] as const;

const DEFAULT_SETTINGS: Settings = {
  defaultDuration: 900,
  voiceStyle: 'warm',
  backgroundSound: 'none',
  inputPreference: 'speak',
  theme: 'warm',
  mascotStyle: 'neo',
  telemetryEnabled: true
};

export default function App() {
  const appVariant = (import.meta.env.VITE_APP_VARIANT as string | undefined) ?? 'user';
  const [currentScreen, setCurrentScreen] = useState<Screen>('inquiry');
  const [answers, setAnswers] = useState<string[]>([]);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [generatedScriptWordCount, setGeneratedScriptWordCount] = useState<number>(0);
  const [generatedPlaylist, setGeneratedPlaylist] = useState<PlaybackSegment[]>([]);
  const [pro, setPro] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallSource, setPaywallSource] = useState<string | undefined>(undefined);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authBusyMode, setAuthBusyMode] = useState<'apple' | 'guest' | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [showStartupScreen, setShowStartupScreen] = useState(true);
  const didTrackOpen = useRef(false);
  
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('mindplan_settings');
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    // Product policy: only 15-minute meditation is supported.
    return { ...parsed, defaultDuration: 900 };
  });

  const refreshProState = async () => {
    try {
      const session = await ensureAnonymousSession();
      if (session?.user?.id) setUserId(session.user.id);
      const rcKey = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined;
      if (rcKey && session?.user?.id) {
        const configured = await configureRevenueCat({ apiKey: rcKey, appUserId: session.user.id, debug: false });
        if (configured) {
          const customerInfo = await getRevenueCatCustomerInfo();
          if (customerInfo) {
            setPro(customerHasPro(customerInfo));
            return;
          }
        }
      }
      const entitlements = await fetchMyEntitlements();
      setPro(isPro(entitlements));
    } catch {
      setPro(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('mindplan_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (settings.defaultDuration !== 900) {
      setSettings((prev) => ({ ...prev, defaultDuration: 900 }));
    }
  }, [settings.defaultDuration]);

  useEffect(() => {
    if (!ALLOWED_THEMES.includes(settings.theme as any)) {
      setSettings(prev => ({ ...prev, theme: 'warm' }));
      return;
    }
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (appVariant === 'admin') return;
    const timer = window.setTimeout(() => setShowStartupScreen(false), 2000);
    return () => window.clearTimeout(timer);
  }, [appVariant]);

  useEffect(() => {
    if (appVariant === 'admin') return;
    let cancelled = false;
    const unsubscribe = onAuthStateChanged((sessionUserId) => {
      if (cancelled) return;
      if (sessionUserId) {
        setUserId(sessionUserId);
        setAuthState('ready');
        setAuthBusyMode(null);
        setAuthErrorMessage(null);
      }
    });
    (async () => {
      try {
        const session = await getExistingSession();
        if (cancelled) return;
        if (session?.user?.id) {
          setUserId(session.user.id);
          setAuthState('ready');
        } else {
          setAuthState('required');
        }
      } catch {
        if (!cancelled) setAuthState('required');
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [appVariant]);

  useEffect(() => {
    if (appVariant === 'admin') return;
    if (authState !== 'ready') return;
    if (didTrackOpen.current) return;
    didTrackOpen.current = true;
    upsertDevice({
      theme: settings.theme,
      appVersion: import.meta.env.VITE_APP_VERSION as string | undefined,
      platform: 'web',
      userId
    });
    logEvent('app_open', { theme: settings.theme });
  }, [appVariant, authState, settings.theme, userId]);

  useEffect(() => {
    if (appVariant === 'admin') return;
    if (authState !== 'ready') return;
    let cancelled = false;
    let cleanup: (() => void | Promise<void>) | null = null;
    (async () => {
      try {
        const session = await ensureAnonymousSession();
        if (session?.user?.id && !cancelled) setUserId(session.user.id);
        const rcKey = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined;
        if (rcKey && session?.user?.id) {
          const configured = await configureRevenueCat({ apiKey: rcKey, appUserId: session.user.id, debug: false });
          if (configured) {
            const customerInfo = await getRevenueCatCustomerInfo();
            if (!cancelled && customerInfo) {
              setPro(customerHasPro(customerInfo));
            }
            cleanup = await onCustomerInfoUpdate((info) => {
              if (!cancelled) setPro(customerHasPro(info));
            });
            return;
          }
        }
        if (!cancelled) {
          const entitlements = await fetchMyEntitlements();
          setPro(isPro(entitlements));
        }
      } catch {
        if (!cancelled) setPro(false);
      }
    })();
    return () => {
      cancelled = true;
      if (cleanup) void cleanup();
    };
  }, [appVariant, authState]);

  useEffect(() => {
    if (appVariant === 'admin') return;
    if (authState !== 'ready') return;
    upsertDevice({
      theme: settings.theme,
      appVersion: import.meta.env.VITE_APP_VERSION as string | undefined,
      platform: 'web',
      userId
    });
  }, [appVariant, authState, settings.theme, userId]);

  const handleStartMeditation = (newAnswers: string[], script: string, playlist: PlaybackSegment[], scriptWordCount: number) => {
    setAnswers(newAnswers);
    setGeneratedScript(script);
    setGeneratedScriptWordCount(scriptWordCount);
    setGeneratedPlaylist(playlist);
    setCurrentScreen('meditation');
  };

  const handleEndMeditation = () => {
    setCurrentScreen('inquiry');
    setAnswers([]);
    setGeneratedScript('');
    setGeneratedScriptWordCount(0);
    setGeneratedPlaylist([]);
  };

  const generateMeditationTitle = () => {
    const titles = [
      "Space for What's Scattered",
      "A Place to Settle",
      "Finding Your Center",
      "Breath and Stillness",
      "Gentle Return",
      "Quiet Presence",
      "Where You Are Now"
    ];
    return titles[Math.floor(Math.random() * titles.length)];
  };

  if (appVariant === 'admin') {
    return <AdminApp />;
  }

  const openPaywall = (source: string) => {
    setPaywallSource(source);
    setPaywallOpen(true);
  };

  const handleGuestContinue = async () => {
    if (authBusyMode) return;
    setAuthBusyMode('guest');
    setAuthErrorMessage(null);
    try {
      const session = await signInAsGuest();
      const nextUserId = session?.user?.id ?? null;
      setUserId(nextUserId);
      setAuthState(nextUserId ? 'ready' : 'required');
      if (!nextUserId) {
        setAuthErrorMessage('Guest sign-in did not complete. Please try again.');
      }
    } catch {
      setAuthErrorMessage('Unable to continue as guest. Please try again.');
    } finally {
      setAuthBusyMode(null);
    }
  };

  const handleAppleSignIn = async () => {
    if (authBusyMode) return;
    setAuthBusyMode('apple');
    setAuthErrorMessage(null);
    try {
      await beginAppleSignIn();
    } catch {
      setAuthErrorMessage('Sign in with Apple is unavailable. Check your Apple auth configuration.');
      setAuthBusyMode(null);
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-[var(--paper-1)] sm:bg-[#1a1a1a]">
      {/* Mobile frame */}
      <div className="relative w-full h-[100dvh] sm:w-[390px] sm:h-[844px] overflow-hidden sm:shadow-2xl">
        {showStartupScreen ? <StartupScreen /> : null}

        {!showStartupScreen && authState === 'checking' ? (
          <div className="absolute inset-0 flex items-center justify-center px-8">
            <p className="text-center" style={{ color: 'var(--warm-grey)', fontSize: 14 }}>
              Preparing secure sign-in...
            </p>
          </div>
        ) : null}

        {!showStartupScreen && authState === 'required' ? (
          <AuthScreen
            busyMode={authBusyMode}
            errorMessage={authErrorMessage}
            onAppleSignIn={handleAppleSignIn}
            onGuestContinue={handleGuestContinue}
          />
        ) : null}

        {!showStartupScreen && authState === 'ready' ? (
          <>
            {currentScreen !== 'inquiry' ? (
              <BackButton onClick={() => (currentScreen === 'meditation' ? handleEndMeditation() : setCurrentScreen('inquiry'))} />
            ) : null}
            {currentScreen === 'inquiry' ? (
              <MembershipBadge
                pro={pro}
                onClick={!pro ? () => openPaywall('membership_badge') : undefined}
              />
            ) : null}
            <AnimatePresence mode="wait" initial={false}>
              {currentScreen === 'inquiry' && (
                <motion.div
                  key="inquiry"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute inset-0"
                >
                  <InquiryScreen
                    onNavigateToSettings={() => setCurrentScreen('settings')}
                    onStartMeditation={handleStartMeditation}
                    defaultDuration={settings.defaultDuration}
                    settings={settings}
                  />
                </motion.div>
              )}

              {currentScreen === 'meditation' && (
                <motion.div
                  key="meditation"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="absolute inset-0"
                >
                  <MeditationScreen
                    onEnd={handleEndMeditation}
                    duration={settings.defaultDuration}
                    title={generateMeditationTitle()}
                    context={answers}
                    settings={settings}
                    initialScript={generatedScript}
                    scriptWordCount={generatedScriptWordCount}
                    initialPlaylist={generatedPlaylist}
                  />
                </motion.div>
              )}

              {currentScreen === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="absolute inset-0"
                >
                  <MySpaceScreen
                    onBack={() => setCurrentScreen('inquiry')}
                    settings={settings}
                    onUpdateSettings={setSettings}
                    pro={pro}
                    userId={userId ?? undefined}
                    onOpenPaywall={openPaywall}
                    onMembershipChanged={refreshProState}
                    onAccountDeleted={() => {
                      setPro(false);
                      setUserId(null);
                      setAuthState('required');
                      setCurrentScreen('inquiry');
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <PaywallModal
              open={paywallOpen}
              source={paywallSource}
              onMembershipChanged={refreshProState}
              onClose={() => setPaywallOpen(false)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
