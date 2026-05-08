
  # MindPlan

  This is a code bundle for Build it now. The original project is available at https://www.figma.com/design/8M9Ao8m2A3BMyjH5YzOAZQ/Build-it-now.

  ## Running the code

  Run `pnpm i` to install the dependencies.

  Run `pnpm run dev` to start the development server.

  Admin: `pnpm run dev:admin`

  ## Payments (US / iOS, RevenueCat)

  Environment variables:

  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_REVENUECAT_IOS_API_KEY`
  - `VITE_SUPABASE_AUTH_REDIRECT_TO` (recommended for Apple OAuth callback)
  - `VITE_PRIVACY_POLICY_URL` (public HTTPS URL for App Store Connect)
  - `VITE_TERMS_OF_SERVICE_URL` (public HTTPS URL for App Store Connect)
  - `VITE_SUPPORT_URL` (recommended for App Store Connect Support URL field)
  - `VITE_SUBSCRIPTION_TERMS_URL` (single legal entry URL)

  Production legal URLs (current):

  - `VITE_PRIVACY_POLICY_URL=https://celebrated-rolypoly-36913a.netlify.app/`
  - `VITE_TERMS_OF_SERVICE_URL=https://celebrated-rolypoly-36913a.netlify.app/`
  - `VITE_SUPPORT_URL=https://celebrated-rolypoly-36913a.netlify.app/`
  - `VITE_SUBSCRIPTION_TERMS_URL=https://celebrated-rolypoly-36913a.netlify.app/`

  AI / TTS / Speech keys are stored server-side (Supabase Edge Function secrets), not in the client.

  Edge Function secrets:
  - `DEEPSEEK_API_KEY`
  - `MINIMAX_API_KEY`
  - `MINIMAX_GROUP_ID`
  - `IFLYTEK_APP_ID`
  - `IFLYTEK_API_KEY`
  - `IFLYTEK_API_SECRET`

  Capacitor (requires Node >= 22 for the Capacitor CLI):

  - `pnpm run build`
  - `npx cap sync ios`
  - `npx cap open ios`
  - Release preflight check: `pnpm run release:preflight`

  RevenueCat setup:

  - Create an entitlement: `pro_access`
  - Add an iOS subscription product and attach it to the entitlement
  - Configure a webhook pointing to a Supabase Edge Function (see `supabase/functions/revenuecat-webhook`)

  Apple Sign-In setup (Supabase Auth):

  - Enable Apple provider in Supabase Auth providers.
  - Configure Apple Service ID / key in Supabase.
  - Ensure app/site redirect URL is whitelisted in Supabase Auth.
  - Set `VITE_SUPABASE_AUTH_REDIRECT_TO` to your approved callback URL.
  - App login screen now supports:
    - `Sign in with Apple`
    - `Continue as Guest`

  Supabase Edge Function:

  - Install Supabase CLI (macOS): `brew install supabase/tap/supabase`
  - Deploy webhook only: `pnpm run supabase:functions:deploy`
  - Deploy AI functions: `pnpm run supabase:functions:deploy:ai`
  - Deploy all required functions: `pnpm run supabase:functions:deploy:all`
  - Set secrets (Project Settings → Edge Functions → Secrets):
    - `REVENUECAT_WEBHOOK_AUTH` (example: `Bearer <random-long-secret>`)
  - RevenueCat webhook should send header:
    - `Authorization: <REVENUECAT_WEBHOOK_AUTH>`
  - Webhook URL:
    - `https://oexjfpzlzwjyvjfircyg.functions.supabase.co/revenuecat-webhook`

  ## US App Store Release Checklist (Final)

  - English UI for onboarding, inquiry, paywall, settings, legal, and account deletion.
  - Restore Purchases available in both Paywall and Settings.
  - In-app legal links available within 2 taps:
    - Privacy Policy
    - Terms of Service
    - Subscription Terms
  - Account and data deletion available in-app with a two-step confirmation.
  - Real entitlement-based Pro state enabled (no forced Pro override).
  - `NSMicrophoneUsageDescription` configured for iOS.

  ## App Store Connect URL Mapping

  Use these values directly in App Store Connect:

  - Support URL:
    - `https://celebrated-rolypoly-36913a.netlify.app/`
  - Privacy Policy URL:
    - `https://celebrated-rolypoly-36913a.netlify.app/`
  - Terms of Use / EULA:
    - `https://celebrated-rolypoly-36913a.netlify.app/`
  - Subscription Terms URL:
    - `https://celebrated-rolypoly-36913a.netlify.app/`
  
