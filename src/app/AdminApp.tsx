import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';

type Tab = 'logs' | 'devices' | 'events' | 'stats' | 'billing';

export default function AdminApp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('logs');
  const [logs, setLogs] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [entitlements, setEntitlements] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  const [billingUserId, setBillingUserId] = useState('');
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  const configured = Boolean(supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setSessionEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const canRead = Boolean(sessionEmail);

  const refresh = async () => {
    if (!supabase || !canRead) return;
    if (tab === 'logs') {
      const { data } = await supabase.from('ai_interactions').select('*').order('created_at', { ascending: false }).limit(200);
      setLogs(data ?? []);
    }
    if (tab === 'devices') {
      const { data } = await supabase.from('devices').select('*').order('last_seen', { ascending: false }).limit(200);
      setDevices(data ?? []);
    }
    if (tab === 'events') {
      const { data } = await supabase.from('app_events').select('*').order('created_at', { ascending: false }).limit(200);
      setEvents(data ?? []);
    }
    if (tab === 'stats') {
      const [{ data: logData }, { data: deviceData }, { data: eventData }] = await Promise.all([
        supabase
          .from('ai_interactions')
          .select('created_at, result_type, meta, round_number, device_key')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('devices').select('theme, last_seen'),
        supabase.from('app_events').select('created_at, event_name')
      ]);
      setLogs(logData ?? []);
      setDevices(deviceData ?? []);
      setEvents(eventData ?? []);
    }
    if (tab === 'billing') {
      const [{ data: planData }, { data: entitlementData }, { data: purchaseData }] = await Promise.all([
        supabase.from('plans').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('entitlements').select('*').order('updated_at', { ascending: false }).limit(200),
        supabase.from('purchases').select('*').order('purchased_at', { ascending: false }).limit(200)
      ]);
      setPlans(planData ?? []);
      setEntitlements(entitlementData ?? []);
      setPurchases(purchaseData ?? []);
    }
  };

  const grantPro = async () => {
    if (!supabase || !canRead) return;
    setBillingMessage(null);
    const userId = billingUserId.trim();
    if (!userId) {
      setBillingMessage('Missing user_id');
      return;
    }
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.rpc('admin_upsert_entitlement', {
      p_user_id: userId,
      p_plan_id: 'pro_monthly',
      p_status: 'active',
      p_current_period_end: until
    });
    if (error) {
      setBillingMessage(error.message);
      return;
    }
    setBillingMessage('Granted Pro for 30 days');
    refresh();
  };

  useEffect(() => {
    refresh();
  }, [tab, canRead]);

  const stats = useMemo(() => {
    const totalLogs = logs.length;
    const totalEvents = events.length;
    const byType: Record<string, number> = {};
    for (const l of logs) {
      const k = l.result_type ?? 'unknown';
      byType[k] = (byType[k] ?? 0) + 1;
    }
    const byEvent: Record<string, number> = {};
    for (const e of events) {
      const k = e.event_name ?? 'unknown';
      byEvent[k] = (byEvent[k] ?? 0) + 1;
    }
    const byTheme: Record<string, number> = {};
    for (const d of devices) {
      const k = d.theme ?? 'unknown';
      byTheme[k] = (byTheme[k] ?? 0) + 1;
    }
    const readinessTurns = logs
      .map((l) => ({
        createdAt: String(l.created_at ?? ''),
        resultType: String(l.result_type ?? ''),
        score: Number(l?.meta?.readinessScore ?? NaN),
        stopReason: String(l?.meta?.stopReason ?? '')
      }))
      .filter((x) => Number.isFinite(x.score));
    const avgReadiness =
      readinessTurns.length > 0
        ? Math.round(readinessTurns.reduce((sum, x) => sum + x.score, 0) / readinessTurns.length)
        : 0;
    const stopReasons: Record<string, number> = {};
    const coveredDimensions: Record<string, number> = {};
    const missingDimensions: Record<string, number> = {};
    for (const l of logs) {
      const reason = String(l?.meta?.stopReason ?? '');
      if (reason) stopReasons[reason] = (stopReasons[reason] ?? 0) + 1;
      const covered = Array.isArray(l?.meta?.coveredDimensions) ? l.meta.coveredDimensions : [];
      const missing = Array.isArray(l?.meta?.missingDimensions) ? l.meta.missingDimensions : [];
      for (const dim of covered) {
        const key = String(dim);
        coveredDimensions[key] = (coveredDimensions[key] ?? 0) + 1;
      }
      for (const dim of missing) {
        const key = String(dim);
        missingDimensions[key] = (missingDimensions[key] ?? 0) + 1;
      }
    }
    const readinessTrend = readinessTurns
      .slice(0, 12)
      .reverse()
      .map((x) => ({ t: x.createdAt.slice(11, 16), score: x.score, type: x.resultType }));
    return {
      totalLogs,
      totalEvents,
      byType,
      byEvent,
      byTheme,
      totalDevices: devices.length,
      avgReadiness,
      readinessSamples: readinessTurns.length,
      stopReasons,
      coveredDimensions,
      missingDimensions,
      readinessTrend
    };
  }, [logs, devices, events]);

  const signIn = async () => {
    if (!supabase) return;
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  };

  const signUp = async () => {
    if (!supabase) return;
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setAuthError(error.message);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setAuthError(signInError.message);
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <div className="w-full h-screen overflow-auto" style={{ background: 'linear-gradient(135deg, var(--paper-1) 0%, var(--paper-2) 100%)' }}>
      <div className="max-w-[920px] mx-auto px-5 py-8">
        <div className="flex items-center justify-between">
          <div style={{ color: 'var(--charcoal)', fontSize: 20, fontWeight: 600 }}>MindPlan Admin</div>
          {sessionEmail ? (
            <div className="flex items-center gap-3">
              <div style={{ color: 'var(--warm-grey)', fontSize: 13 }}>{sessionEmail}</div>
              <button
                onClick={signOut}
                className="px-4 py-2 rounded-full"
                style={{ background: 'var(--surface-70)', color: 'var(--charcoal)', border: '1px solid var(--warm-grey-30)' }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>

        {!configured ? (
          <div className="mt-6 rounded-2xl p-5" style={{ background: 'var(--surface-60)', color: 'var(--charcoal)', border: '1px solid var(--warm-grey-30)' }}>
            Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
          </div>
        ) : null}

        {configured && !sessionEmail ? (
          <div className="mt-6 rounded-2xl p-6" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
            <div className="grid gap-3">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full h-12 rounded-xl px-4 bg-transparent outline-none"
                style={{ border: '1px solid var(--warm-grey-30)', color: 'var(--ink-90)' }}
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                className="w-full h-12 rounded-xl px-4 bg-transparent outline-none"
                style={{ border: '1px solid var(--warm-grey-30)', color: 'var(--ink-90)' }}
              />
              <button
                onClick={signIn}
                className="h-12 rounded-xl"
                style={{ background: 'var(--terracotta)', color: 'var(--surface-95)', fontWeight: 600 }}
              >
                Sign in
              </button>
              <button
                onClick={signUp}
                className="h-12 rounded-xl"
                style={{ background: 'var(--surface-70)', color: 'var(--charcoal)', fontWeight: 600, border: '1px solid var(--warm-grey-30)' }}
              >
                Create account
              </button>
              {authError ? <div style={{ color: 'var(--terracotta)', fontSize: 13 }}>{authError}</div> : null}
            </div>
          </div>
        ) : null}

        {configured && sessionEmail ? (
          <>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setTab('billing')}
                className="px-4 py-2 rounded-full"
                style={{
                  background: tab === 'billing' ? 'var(--terracotta)' : 'var(--surface-70)',
                  color: tab === 'billing' ? 'var(--surface-95)' : 'var(--charcoal)',
                  border: tab === 'billing' ? 'none' : '1px solid var(--warm-grey-30)'
                }}
              >
                BILLING
              </button>
              {(['logs', 'devices', 'events', 'stats'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-4 py-2 rounded-full"
                  style={{
                    background: tab === t ? 'var(--terracotta)' : 'var(--surface-70)',
                    color: tab === t ? 'var(--surface-95)' : 'var(--charcoal)',
                    border: tab === t ? 'none' : '1px solid var(--warm-grey-30)'
                  }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
              <button
                onClick={refresh}
                className="ml-auto px-4 py-2 rounded-full"
                style={{ background: 'var(--surface-70)', color: 'var(--charcoal)', border: '1px solid var(--warm-grey-30)' }}
              >
                Refresh
              </button>
            </div>

            {tab === 'stats' ? (
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Counts</div>
                  <div className="mt-2 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    <div>Total devices: {stats.totalDevices}</div>
                    <div>Total AI logs: {stats.totalLogs}</div>
                    <div>Total events: {stats.totalEvents}</div>
                  </div>
                </div>
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>AI result_type</div>
                  <div className="mt-2 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    {Object.entries(stats.byType).map(([k, v]) => (
                      <div key={k}>{k}: {v}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Events</div>
                  <div className="mt-2 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    {Object.entries(stats.byEvent).map(([k, v]) => (
                      <div key={k}>{k}: {v}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Themes</div>
                  <div className="mt-2 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    {Object.entries(stats.byTheme).map(([k, v]) => (
                      <div key={k}>{k}: {v}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Readiness Snapshot</div>
                  <div className="mt-2 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    <div>Average score: {stats.avgReadiness}</div>
                    <div>Samples: {stats.readinessSamples}</div>
                  </div>
                  <div className="mt-3 grid gap-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                    {stats.readinessTrend.length === 0 ? (
                      <div>No readiness samples yet.</div>
                    ) : (
                      stats.readinessTrend.map((p, idx) => (
                        <div key={`${p.t}-${idx}`}>{p.t} · {p.type} · score {p.score}</div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Stop Reasons</div>
                  <div className="mt-2 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    {Object.keys(stats.stopReasons).length === 0 ? (
                      <div>No stop reason data yet.</div>
                    ) : (
                      Object.entries(stats.stopReasons).map(([k, v]) => (
                        <div key={k}>{k}: {v}</div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Dimension Coverage</div>
                  <div className="mt-2 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    {Object.keys(stats.coveredDimensions).length === 0 ? (
                      <div>No dimension data yet.</div>
                    ) : (
                      Object.entries(stats.coveredDimensions).map(([k, v]) => (
                        <div key={k}>{k}: {v}</div>
                      ))
                    )}
                  </div>
                  <div className="mt-3" style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: 13 }}>Still Missing</div>
                  <div className="mt-1 grid gap-1" style={{ color: 'var(--warm-grey)' }}>
                    {Object.keys(stats.missingDimensions).length === 0 ? (
                      <div>No missing-dimension data yet.</div>
                    ) : (
                      Object.entries(stats.missingDimensions).map(([k, v]) => (
                        <div key={k}>{k}: {v}</div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'logs' ? (
              <div className="mt-6 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--warm-grey-30)' }}>
                <div className="grid" style={{ background: 'var(--surface-60)' }}>
                  {(logs ?? []).length === 0 ? (
                    <div className="px-4 py-6" style={{ color: 'var(--warm-grey)' }}>
                      No logs yet. Open the user app and complete a round to generate data.
                    </div>
                  ) : null}
                  {(logs ?? []).slice(0, 200).map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLog(l)}
                      className="px-4 py-3 text-left"
                      style={{ borderBottom: '1px solid var(--warm-grey-30)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: 13 }}>{l.result_type ?? 'unknown'} · round {l.round_number ?? '-'}</div>
                        <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{String(l.created_at ?? '')}</div>
                      </div>
                      <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{l.device_key}</div>
                      <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 13 }}>{l.question}</div>
                      <div className="mt-1" style={{ color: 'var(--charcoal)', fontSize: 14 }}>{l.user_answer}</div>
                      {Number.isFinite(Number(l?.meta?.readinessScore)) ? (
                        <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                          readiness: {Number(l.meta.readinessScore)} · stop: {String(l?.meta?.stopReason ?? '-')}
                        </div>
                      ) : null}
                      {l.next_question ? <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 13 }}>Next: {l.next_question}</div> : null}
                      {l.error ? <div className="mt-1" style={{ color: 'var(--terracotta)', fontSize: 13 }}>{l.error}</div> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === 'devices' ? (
              <div className="mt-6 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--warm-grey-30)' }}>
                <div className="grid" style={{ background: 'var(--surface-60)' }}>
                  {(devices ?? []).length === 0 ? (
                    <div className="px-4 py-6" style={{ color: 'var(--warm-grey)' }}>
                      No devices yet. Open the user app to register a device.
                    </div>
                  ) : null}
                  {(devices ?? []).slice(0, 200).map((d) => (
                    <button
                      key={d.device_key}
                      onClick={() => setSelectedDevice(d)}
                      className="px-4 py-3 text-left"
                      style={{ borderBottom: '1px solid var(--warm-grey-30)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: 13 }}>{d.device_key}</div>
                        <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{String(d.last_seen ?? '')}</div>
                      </div>
                      <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 13 }}>
                        theme: {d.theme ?? '-'} · platform: {d.platform ?? '-'} · version: {d.app_version ?? '-'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === 'events' ? (
              <div className="mt-6 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--warm-grey-30)' }}>
                <div className="grid" style={{ background: 'var(--surface-60)' }}>
                  {(events ?? []).length === 0 ? (
                    <div className="px-4 py-6" style={{ color: 'var(--warm-grey)' }}>
                      No events yet.
                    </div>
                  ) : null}
                  {(events ?? []).slice(0, 200).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setSelectedEvent(e)}
                      className="px-4 py-3 text-left"
                      style={{ borderBottom: '1px solid var(--warm-grey-30)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: 13 }}>{e.event_name ?? 'event'}</div>
                        <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{String(e.created_at ?? '')}</div>
                      </div>
                      <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{e.device_key}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === 'billing' ? (
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div className="flex items-center justify-between">
                    <div style={{ color: 'var(--charcoal)', fontWeight: 650 }}>Plans</div>
                    <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{plans.length}</div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {(plans ?? []).slice(0, 30).map((p) => (
                      <div key={p.id} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-70)', border: '1px solid var(--warm-grey-30)' }}>
                        <div className="flex items-center justify-between">
                          <div style={{ color: 'var(--charcoal)', fontWeight: 650, fontSize: 13 }}>{p.id}</div>
                          <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{p.is_active ? 'active' : 'inactive'}</div>
                        </div>
                        <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                          {p.title} · {p.platform} · {p.product_type} · {p.currency} {(p.price_cents ?? 0) / 100}
                        </div>
                      </div>
                    ))}
                    {(plans ?? []).length === 0 ? <div style={{ color: 'var(--warm-grey)', fontSize: 13 }}>No plans yet.</div> : null}
                  </div>
                </div>

                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 650 }}>Manual grant</div>
                  <div className="mt-3 grid gap-2">
                    <input
                      value={billingUserId}
                      onChange={(e) => setBillingUserId(e.target.value)}
                      placeholder="Supabase auth user_id (uuid)"
                      className="w-full h-12 rounded-xl px-4 bg-transparent outline-none"
                      style={{ border: '1px solid var(--warm-grey-30)', color: 'var(--ink-90)' }}
                    />
                    <button
                      onClick={grantPro}
                      className="h-12 rounded-xl"
                      style={{ background: 'var(--terracotta)', color: 'var(--surface-95)', fontWeight: 650 }}
                    >
                      Grant Pro (30 days)
                    </button>
                    {billingMessage ? <div style={{ color: 'var(--warm-grey)', fontSize: 13 }}>{billingMessage}</div> : null}
                  </div>
                </div>

                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div className="flex items-center justify-between">
                    <div style={{ color: 'var(--charcoal)', fontWeight: 650 }}>Entitlements</div>
                    <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{entitlements.length}</div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {(entitlements ?? []).slice(0, 30).map((e) => (
                      <div key={e.id} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-70)', border: '1px solid var(--warm-grey-30)' }}>
                        <div className="flex items-center justify-between">
                          <div style={{ color: 'var(--charcoal)', fontWeight: 650, fontSize: 13 }}>{e.plan_id}</div>
                          <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{e.status}</div>
                        </div>
                        <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                          user_id: {e.user_id} · source: {e.source}
                        </div>
                        {e.current_period_end ? <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>until: {String(e.current_period_end)}</div> : null}
                      </div>
                    ))}
                    {(entitlements ?? []).length === 0 ? <div style={{ color: 'var(--warm-grey)', fontSize: 13 }}>No entitlements yet.</div> : null}
                  </div>
                </div>

                <div className="rounded-2xl p-5" style={{ background: 'var(--surface-60)', border: '1px solid var(--warm-grey-30)' }}>
                  <div className="flex items-center justify-between">
                    <div style={{ color: 'var(--charcoal)', fontWeight: 650 }}>Purchases</div>
                    <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{purchases.length}</div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {(purchases ?? []).slice(0, 30).map((p) => (
                      <div key={p.id} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-70)', border: '1px solid var(--warm-grey-30)' }}>
                        <div className="flex items-center justify-between">
                          <div style={{ color: 'var(--charcoal)', fontWeight: 650, fontSize: 13 }}>{p.provider}</div>
                          <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{p.status}</div>
                        </div>
                        <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                          tx: {p.provider_tx_id} · plan: {p.plan_id ?? '-'}
                        </div>
                        <div className="mt-1" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                          user_id: {p.user_id} · {p.currency ?? ''} {p.amount_cents ? p.amount_cents / 100 : '-'}
                        </div>
                      </div>
                    ))}
                    {(purchases ?? []).length === 0 ? <div style={{ color: 'var(--warm-grey)', fontSize: 13 }}>No purchases yet.</div> : null}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {(selectedLog || selectedEvent || selectedDevice) ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => {
            setSelectedLog(null);
            setSelectedEvent(null);
            setSelectedDevice(null);
          }}
        >
          <div
            className="w-full max-w-[920px] max-h-[85vh] overflow-auto rounded-2xl p-5"
            style={{ background: 'var(--surface-95)', border: '1px solid var(--warm-grey-30)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div style={{ color: 'var(--charcoal)', fontWeight: 700, fontSize: 16 }}>
                {selectedLog ? 'AI Interaction' : selectedEvent ? 'Event' : 'Device'}
              </div>
              <button
                className="px-3 py-1 rounded-full"
                style={{ background: 'var(--surface-70)', color: 'var(--charcoal)', border: '1px solid var(--warm-grey-30)' }}
                onClick={() => {
                  setSelectedLog(null);
                  setSelectedEvent(null);
                  setSelectedDevice(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {selectedLog ? (
                <>
                  <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{selectedLog.device_key} · {String(selectedLog.created_at ?? '')}</div>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Question</div>
                  <div style={{ color: 'var(--ink-90)', whiteSpace: 'pre-wrap' }}>{selectedLog.question ?? ''}</div>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>User answer</div>
                  <div style={{ color: 'var(--ink-90)', whiteSpace: 'pre-wrap' }}>{selectedLog.user_answer ?? ''}</div>
                  {selectedLog.next_question ? (
                    <>
                      <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Next question</div>
                      <div style={{ color: 'var(--ink-90)', whiteSpace: 'pre-wrap' }}>{selectedLog.next_question}</div>
                    </>
                  ) : null}
                  {selectedLog.meditation_script ? (
                    <>
                      <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Meditation script</div>
                      <div
                        className="rounded-xl p-4"
                        style={{ background: 'var(--surface-70)', border: '1px solid var(--warm-grey-30)', color: 'var(--ink-90)', whiteSpace: 'pre-wrap' }}
                      >
                        {selectedLog.meditation_script}
                      </div>
                    </>
                  ) : null}
                  {selectedLog.error ? (
                    <>
                      <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Error</div>
                      <div style={{ color: 'var(--terracotta)', whiteSpace: 'pre-wrap' }}>{selectedLog.error}</div>
                    </>
                  ) : null}
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Meta</div>
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'var(--surface-70)', border: '1px solid var(--warm-grey-30)', color: 'var(--ink-90)', whiteSpace: 'pre-wrap' }}
                  >
                    {JSON.stringify(selectedLog.meta ?? {}, null, 2)}
                  </div>
                </>
              ) : null}

              {selectedEvent ? (
                <>
                  <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{selectedEvent.device_key} · {String(selectedEvent.created_at ?? '')}</div>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Event name</div>
                  <div style={{ color: 'var(--ink-90)' }}>{selectedEvent.event_name}</div>
                  <div style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Payload</div>
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'var(--surface-70)', border: '1px solid var(--warm-grey-30)', color: 'var(--ink-90)', whiteSpace: 'pre-wrap' }}
                  >
                    {JSON.stringify(selectedEvent.payload ?? {}, null, 2)}
                  </div>
                </>
              ) : null}

              {selectedDevice ? (
                <>
                  <div style={{ color: 'var(--warm-grey)', fontSize: 12 }}>{selectedDevice.device_key}</div>
                  <div className="grid gap-1" style={{ color: 'var(--ink-90)' }}>
                    <div>created_at: {String(selectedDevice.created_at ?? '')}</div>
                    <div>last_seen: {String(selectedDevice.last_seen ?? '')}</div>
                    <div>platform: {String(selectedDevice.platform ?? '')}</div>
                    <div>app_version: {String(selectedDevice.app_version ?? '')}</div>
                    <div>theme: {String(selectedDevice.theme ?? '')}</div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
