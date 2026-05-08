const DEFAULT_LEGAL_URL = 'https://celebrated-rolypoly-36913a.netlify.app/';

export function getPrivacyPolicyUrl() {
  return (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)
    ?? DEFAULT_LEGAL_URL;
}

export function getTermsOfServiceUrl() {
  return (import.meta.env.VITE_TERMS_OF_SERVICE_URL as string | undefined)
    ?? DEFAULT_LEGAL_URL;
}

export function getSubscriptionTermsUrl() {
  return (import.meta.env.VITE_SUBSCRIPTION_TERMS_URL as string | undefined)
    ?? DEFAULT_LEGAL_URL;
}
