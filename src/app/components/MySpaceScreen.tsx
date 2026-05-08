import { useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ProPromoBanner } from './ProPromoBanner';
import { isRevenueCatNativeSupported, restorePurchases } from '../../services/revenuecat';
import { deleteMyAccountAndData } from '../../services/account';
import { getPrivacyPolicyUrl, getSubscriptionTermsUrl, getTermsOfServiceUrl } from '../../config/legal';

interface MySpaceScreenProps {
  onBack: () => void;
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
  pro?: boolean;
  userId?: string;
  onOpenPaywall: (source: string) => void;
  onMembershipChanged?: () => void | Promise<void>;
  onAccountDeleted?: () => void;
}

export interface Settings {
  defaultDuration: number;
  voiceStyle: 'warm' | 'calm';
  backgroundSound: 'forest' | 'ocean' | 'fire' | 'rain' | 'none';
  inputPreference: 'speak' | 'type';
  theme: 'warm' | 'sage' | 'ocean' | 'rose' | 'aurora' | 'sunset' | 'lavender' | 'graphite';
  mascotStyle: 'neo' | 'peach' | 'mint' | 'violet' | 'sunny';
  telemetryEnabled: boolean;
}

const soundIcons = {
  forest: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L8 8h8l-4-6zm0 6L8 14h8l-4-6zm0 6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  ocean: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  fire: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2c-3 4-2 8 0 10 2-2 3-6 0-10zm0 10c-2 2-2 5 0 8 2-3 2-6 0-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  rain: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M8 13v6M12 11v8M16 13v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  none: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
};

const themeOptions = [
  { id: 'warm', label: 'Warm', sky: '#90d8ff', mid: '#ffd37f', ground: '#7fcf72', accent: '#ff9a6b' },
  { id: 'sage', label: 'Sage', sky: '#93d3b9', mid: '#bfdc87', ground: '#5ea06e', accent: '#4d7f56' },
  { id: 'ocean', label: 'Ocean', sky: '#8ac5ff', mid: '#69a7ff', ground: '#3f7ec4', accent: '#a2ecff' },
  { id: 'rose', label: 'Rose', sky: '#ffc0db', mid: '#ff8fc3', ground: '#d66b9d', accent: '#fff1a1' },
  { id: 'aurora', label: 'Aurora', sky: '#8affef', mid: '#76a9ff', ground: '#5f6be3', accent: '#dbff85' },
  { id: 'sunset', label: 'Sunset', sky: '#ffb178', mid: '#ff7b95', ground: '#8e5ba9', accent: '#ffe17d' },
  { id: 'lavender', label: 'Lavender', sky: '#c2b4ff', mid: '#9f8cff', ground: '#7165c9', accent: '#ffd1ff' },
  { id: 'graphite', label: 'Graphite', sky: '#9eb0cf', mid: '#717ea7', ground: '#414a70', accent: '#d2dbff' },
] as const;

const mascotOptions = [
  { id: 'neo', label: 'Neo Bean', primary: '#8fd3ff', secondary: '#ff9f6e', border: '#4d3ecf' },
  { id: 'peach', label: 'Peach Bunny', primary: '#ffd1dc', secondary: '#ffb36b', border: '#9a4d7a' },
  { id: 'mint', label: 'Mint Puff', primary: '#b8f3d8', secondary: '#7dd9ff', border: '#34786f' },
  { id: 'violet', label: 'Violet Cat', primary: '#cbb7ff', secondary: '#8eb8ff', border: '#56439f' },
  { id: 'sunny', label: 'Sunny Bear', primary: '#ffe39f', secondary: '#ffc27a', border: '#9f6f32' }
] as const;

export function MySpaceScreen({ onBack, settings, onUpdateSettings, pro, userId, onOpenPaywall, onMembershipChanged, onAccountDeleted }: MySpaceScreenProps) {
  const [showAbout, setShowAbout] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [billingHint, setBillingHint] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteHint, setDeleteHint] = useState<string | null>(null);
  const canUseNativeBilling = isRevenueCatNativeSupported();
  const PRIVACY_URL = getPrivacyPolicyUrl();
  const TERMS_URL = getTermsOfServiceUrl();
  const SUBSCRIPTION_TERMS_URL = getSubscriptionTermsUrl();
  const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const cardStyle: CSSProperties = {
    background: 'var(--menu-surface)',
    border: '1px solid var(--menu-border-soft)',
    backdropFilter: 'blur(20px)',
    boxShadow: 'var(--menu-card-shadow)'
  };

  const sectionTitleStyle: CSSProperties = {
    color: 'var(--charcoal)',
    fontSize: '16px',
    fontWeight: 600
  };

  const openExternal = (url: string) => {
    if (typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleReset = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000);
    } else {
      onUpdateSettings({
        defaultDuration: 900,
        voiceStyle: 'warm',
        backgroundSound: 'none',
        inputPreference: 'speak',
        theme: 'warm',
        mascotStyle: 'neo',
        telemetryEnabled: true
      });
      setResetConfirm(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-auto" style={{
      background: 'linear-gradient(135deg, var(--paper-1) 0%, var(--paper-2) 100%)',
      fontFamily: 'var(--font-sans)'
    }}>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-44"
        style={{ background: 'linear-gradient(180deg, rgba(248, 242, 236, 0) 0%, rgba(248, 242, 236, 0.42) 100%)' }}
      />

      {/* Header */}
      <div className="relative pt-8 pb-6 px-6">
        <h1
          className="text-center tracking-[0.15em]"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--charcoal)',
            fontSize: '14px',
            fontWeight: 400
          }}
        >
          My Space
        </h1>
      </div>

      {/* Settings cards */}
      <div className="relative px-6 pb-24 space-y-4">
        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Membership</span>
            <div className="flex items-center gap-3">
              <div style={{ color: 'var(--warm-grey)', fontSize: '14px' }}>{pro ? 'Active' : 'Free'}</div>
              <button
                onClick={() => {
                  onOpenPaywall('settings_upgrade');
                }}
                className="px-4 py-2 rounded-full transition-all duration-300"
                style={{
                  background: 'var(--menu-pill-active-bg)',
                  color: 'var(--menu-pill-active-fg)',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Upgrade
              </button>
            </div>
          </div>
          {userId ? (
            <div className="mt-2" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
              user_id: {userId}
            </div>
          ) : null}
          {!pro ? (
            <div className="mt-4">
              <ProPromoBanner
                onUpgrade={() => onOpenPaywall('promo_banner_settings')}
              />
            </div>
          ) : null}
        </div>

        {/* Default Duration */}
        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Default Duration</span>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-full transition-all duration-300 cursor-default"
                style={{
                  background: 'var(--menu-pill-active-bg)',
                  color: 'var(--menu-pill-active-fg)',
                  border: '1.5px solid var(--menu-pill-active-ring)',
                  fontSize: '14px',
                  fontWeight: 560
                }}
                aria-label="Default duration fixed to 15 minutes"
                title="Default duration is fixed to 15 minutes"
              >
                15 min
              </button>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Subscription</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openExternal(APPLE_SUBSCRIPTIONS_URL)}
                className="px-3 py-2 rounded-full transition-all duration-300"
                style={{
                  background: 'var(--menu-pill-bg)',
                  color: 'var(--menu-pill-text)',
                  border: '1.5px solid var(--menu-pill-border)',
                  fontSize: '13px'
                }}
              >
                Manage
              </button>
              <button
                onClick={async () => {
                  if (billingBusy) return;
                  if (!canUseNativeBilling) {
                    setBillingHint('Restore is available in the iOS app build only.');
                    return;
                  }
                  setBillingBusy(true);
                  setBillingHint(null);
                  try {
                    await restorePurchases();
                    await onMembershipChanged?.();
                    setBillingHint('Restore requested. Your Pro status should refresh shortly.');
                  } catch {
                    setBillingHint('Restore failed. Please try again later.');
                  } finally {
                    setBillingBusy(false);
                  }
                }}
                className="px-3 py-2 rounded-full transition-all duration-300"
                style={{
                  background: 'var(--menu-pill-bg)',
                  color: 'var(--menu-pill-text)',
                  border: '1.5px solid var(--menu-pill-border)',
                  fontSize: '13px',
                  opacity: billingBusy ? 0.7 : 1
                }}
              >
                Restore
              </button>
            </div>
          </div>
          <div className="mt-2" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
            Subscriptions are managed through Apple In-App Purchase on iOS.
            {!canUseNativeBilling ? ' This preview cannot restore purchases.' : ''}
          </div>
          {billingHint ? (
            <div className="mt-2" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
              {billingHint}
            </div>
          ) : null}
        </div>

        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Legal & Privacy</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openExternal(PRIVACY_URL)}
                className="px-3 py-2 rounded-full transition-all duration-300"
                style={{
                  background: 'var(--menu-pill-bg)',
                  color: 'var(--menu-pill-text)',
                  border: '1.5px solid var(--menu-pill-border)',
                  fontSize: '13px'
                }}
              >
                Privacy Policy
              </button>
              <button
                onClick={() => openExternal(TERMS_URL)}
                className="px-3 py-2 rounded-full transition-all duration-300"
                style={{
                  background: 'var(--menu-pill-bg)',
                  color: 'var(--menu-pill-text)',
                  border: '1.5px solid var(--menu-pill-border)',
                  fontSize: '13px'
                }}
              >
                Terms
              </button>
              <button
                onClick={() => openExternal(SUBSCRIPTION_TERMS_URL)}
                className="px-3 py-2 rounded-full transition-all duration-300"
                style={{
                  background: 'var(--menu-pill-bg)',
                  color: 'var(--menu-pill-text)',
                  border: '1.5px solid var(--menu-pill-border)',
                  fontSize: '13px'
                }}
              >
                Subscription Terms
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <div style={{ color: 'var(--charcoal)', fontSize: 14 }}>Upload interaction content for service improvement</div>
              <div style={{ color: 'var(--warm-grey)', fontSize: 12, marginTop: 4 }}>
                When enabled, prompts, responses, and scripts are uploaded for quality improvements. When disabled, this content stays local.
              </div>
            </div>
            <button
              onClick={() => updateSetting('telemetryEnabled', !settings.telemetryEnabled)}
              className="ml-3 px-3 py-1.5 rounded-full transition-all duration-300"
              style={{
                minWidth: 58,
                background: settings.telemetryEnabled ? 'var(--menu-pill-active-soft)' : 'var(--menu-pill-bg)',
                border: settings.telemetryEnabled
                  ? '1.5px solid var(--menu-pill-active-ring)'
                  : '1.5px solid var(--menu-pill-border)',
                color: settings.telemetryEnabled ? 'var(--menu-pill-active-bg)' : 'var(--menu-pill-text)',
                fontSize: 12,
                fontWeight: 650
              }}
            >
              {settings.telemetryEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Voice Style */}
        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Input Method</span>
            <div className="flex gap-2">
              {([
                { id: 'speak', label: 'Speak' },
                { id: 'type', label: 'Type' }
              ] as const).map((method) => (
                <button
                  key={method.id}
                  onClick={() => updateSetting('inputPreference', method.id)}
                  className="px-4 py-2 rounded-full transition-all duration-300"
                  style={{
                    background: settings.inputPreference === method.id
                      ? 'var(--menu-pill-active-bg)'
                      : 'var(--menu-pill-bg)',
                    color: settings.inputPreference === method.id
                      ? 'var(--menu-pill-active-fg)'
                      : 'var(--menu-pill-text)',
                    border: settings.inputPreference === method.id
                      ? '1.5px solid var(--menu-pill-active-ring)'
                      : '1.5px solid var(--menu-pill-border)',
                    fontSize: '14px',
                    fontWeight: 560
                  }}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Voice Style</span>
            <div className="flex gap-2">
              {(['warm', 'calm'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => {
                    if (!pro && style === 'calm') {
                      onOpenPaywall('settings_voice_lock');
                      return;
                    }
                    onUpdateSettings({ ...settings, voiceStyle: style });
                  }}
                  className="px-5 py-2 rounded-full transition-all duration-300 capitalize"
                  style={{
                    background: settings.voiceStyle === style
                      ? 'var(--menu-pill-active-bg)'
                      : 'var(--menu-pill-bg)',
                    color: settings.voiceStyle === style
                      ? 'var(--menu-pill-active-fg)'
                      : 'var(--menu-pill-text)',
                    border: settings.voiceStyle === style
                      ? '1.5px solid var(--menu-pill-active-ring)'
                      : '1.5px solid var(--menu-pill-border)',
                    fontSize: '14px',
                    fontWeight: 560,
                    opacity: !pro && style === 'calm' ? 0.55 : 1
                  }}
                >
                  {style === 'warm' ? 'Warm' : 'Calm'}{!pro && style === 'calm' ? ' Pro' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Background Sound */}
        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Background Sound</span>
            <div className="flex gap-3 overflow-x-auto">
              {(Object.keys(soundIcons) as Array<keyof typeof soundIcons>).map((sound) => (
                <button
                  key={sound}
                  onClick={() => updateSetting('backgroundSound', sound)}
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    color: settings.backgroundSound === sound
                      ? 'var(--menu-pill-active-bg)'
                      : 'var(--menu-pill-text)',
                    border: settings.backgroundSound === sound
                      ? '2px solid var(--menu-pill-active-bg)'
                      : '1.5px solid var(--menu-pill-border)',
                    background: settings.backgroundSound === sound
                      ? 'var(--menu-pill-active-soft)'
                      : 'var(--menu-pill-bg)'
                  }}
                  aria-label={sound}
                >
                  {soundIcons[sound]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sync Device */}

        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Theme</span>
            <div className="flex gap-2 overflow-x-auto">
              {themeOptions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => updateSetting('theme', t.id)}
                  className="flex-shrink-0 w-12"
                  aria-label={t.label}
                >
                  <div
                    className="w-10 h-10 rounded-lg mx-auto relative overflow-hidden"
                    style={{
                      background: t.sky,
                      border: settings.theme === t.id ? '2px solid var(--menu-pill-active-bg)' : '1.5px solid var(--menu-pill-border)',
                      boxShadow: settings.theme === t.id ? '0 0 0 3px var(--menu-pill-active-soft)' : 'none'
                    }}
                  >
                    <div
                      className="absolute left-0 top-4 w-full h-2"
                      style={{ background: t.mid }}
                    />
                    <div
                      className="absolute left-0 bottom-0 w-full h-3"
                      style={{ background: t.ground }}
                    />
                    <div
                      className="absolute left-1 top-1 w-2 h-2"
                      style={{ background: t.accent }}
                    />
                    <div
                      className="absolute right-1 bottom-1 w-2 h-2"
                      style={{ background: 'rgba(255,255,255,0.28)' }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-center" style={{ color: 'var(--warm-grey)' }}>
                    {t.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl p-6"
          style={cardStyle}
        >
          <div className="flex items-center justify-between">
            <span style={sectionTitleStyle}>Mascot</span>
            <div className="flex gap-2 overflow-x-auto">
              {mascotOptions.map((m) => (
                <button
                  key={m.id}
                  onClick={() => updateSetting('mascotStyle', m.id)}
                  className="flex-shrink-0 w-12"
                  aria-label={m.label}
                >
                  <div
                    className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
                    style={{
                      background: `linear-gradient(145deg, ${m.primary} 0%, ${m.secondary} 100%)`,
                      border: settings.mascotStyle === m.id ? '2px solid var(--menu-pill-active-bg)' : '1.5px solid var(--menu-pill-border)',
                      boxShadow: settings.mascotStyle === m.id ? '0 0 0 3px var(--menu-pill-active-soft)' : 'none'
                    }}
                  >
                    <div
                      className="w-4 h-4"
                      style={{
                        background: m.border,
                        boxShadow: `2px 0 0 ${m.primary}, -2px 0 0 ${m.primary}, 0 2px 0 ${m.secondary}`
                      }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-center" style={{ color: 'var(--warm-grey)' }}>
                    {m.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* About */}
        <motion.div
          className="rounded-3xl overflow-hidden"
          style={cardStyle}
          animate={{ height: showAbout ? 'auto' : '72px' }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <button
            onClick={() => setShowAbout(!showAbout)}
            className="w-full p-6 flex items-center justify-between"
          >
            <span style={{ color: 'var(--warm-grey)', fontSize: '15px' }}>About MindPlan</span>
            <motion.svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              animate={{ rotate: showAbout ? 90 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <path
                d="M6 4 L10 8 L6 12"
                fill="none"
                stroke="var(--warm-grey)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          </button>
          <AnimatePresence>
            {showAbout && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="px-6 pb-6"
              >
                <p
                  style={{
                    color: 'var(--charcoal)',
                    fontSize: '15px',
                    lineHeight: '1.7',
                    fontWeight: 300
                  }}
                >
                  MindPlan creates personalized meditation sessions through gentle prompts. You can control interaction-content upload in Legal & Privacy.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Reset */}
        <div className="pt-8 pb-4 text-center">
          <div
            className="mb-4 rounded-2xl p-4 text-left"
            style={{
              background: 'var(--menu-surface-strong)',
              border: '1px solid var(--menu-border-soft)',
              backdropFilter: 'blur(18px)',
              boxShadow: 'var(--menu-card-shadow)'
            }}
          >
            <div style={{ color: 'var(--charcoal)', fontSize: 14, fontWeight: 650 }}>Account & Data</div>
            <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12, lineHeight: 1.5 }}>
              Deleting will remove cloud data linked to this account and local memory. This cannot be undone.
            </div>
            <button
              disabled={deleteBusy}
              onClick={async () => {
                if (deleteBusy) return;
                if (!deleteConfirm) {
                  setDeleteConfirm(true);
                  setDeleteHint('Tap again to permanently delete account and data.');
                  setTimeout(() => setDeleteConfirm(false), 4000);
                  return;
                }
                setDeleteBusy(true);
                setDeleteHint(null);
                try {
                  await deleteMyAccountAndData();
                  setDeleteHint('Account and data deleted. Refreshing now.');
                  onAccountDeleted?.();
                  setTimeout(() => window.location.reload(), 450);
                } catch {
                  setDeleteHint('Delete failed. Please try again later.');
                } finally {
                  setDeleteBusy(false);
                }
              }}
              className="mt-3 px-4 py-2 rounded-full transition-opacity"
              style={{
                background: 'var(--menu-danger-bg)',
                border: '1px solid var(--menu-danger-border)',
                color: 'var(--menu-danger-fg)',
                fontSize: '13px',
                fontWeight: 650,
                opacity: deleteBusy ? 0.7 : 1
              }}
            >
              {deleteBusy ? 'Processing…' : deleteConfirm ? 'Confirm Delete Account & Data' : 'Delete Account & Data'}
            </button>
            {deleteHint ? (
              <div className="mt-2" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                {deleteHint}
              </div>
            ) : null}
          </div>

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 transition-opacity hover:opacity-70"
            style={{
              color: 'var(--warm-grey)',
              fontSize: '13px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path
                d="M 7 2 A 5 5 0 1 1 2 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M 2 4 L 2 7 L 5 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{resetConfirm ? 'Tap Again to Confirm' : 'Reset All Settings'}</span>
          </button>
        </div>
      </div>

    </div>
  );
}
