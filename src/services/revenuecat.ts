import { Capacitor } from '@capacitor/core';

export const REVENUECAT_PRO_ENTITLEMENT = 'pro_access';

type PurchasesModule = typeof import('@revenuecat/purchases-capacitor');

async function getPurchasesModule(): Promise<PurchasesModule | null> {
  if (!Capacitor.isNativePlatform()) return null;
  return await import('@revenuecat/purchases-capacitor');
}

export function isRevenueCatNativeSupported() {
  return Capacitor.isNativePlatform();
}

export async function configureRevenueCat(input: { apiKey?: string; appUserId?: string; debug?: boolean }) {
  const mod = await getPurchasesModule();
  if (!mod) return false;
  if (!input.apiKey) return false;
  if (input.debug) await mod.Purchases.setLogLevel({ level: mod.LOG_LEVEL.DEBUG });
  await mod.Purchases.configure({ apiKey: input.apiKey, appUserID: input.appUserId });
  return true;
}

export async function getRevenueCatCustomerInfo() {
  const mod = await getPurchasesModule();
  if (!mod) return null;
  const { customerInfo } = await mod.Purchases.getCustomerInfo();
  return customerInfo ?? null;
}

export async function onCustomerInfoUpdate(cb: (customerInfo: any) => void) {
  const mod = await getPurchasesModule();
  if (!mod) return () => {};
  const id = await mod.Purchases.addCustomerInfoUpdateListener((customerInfo: any) => cb(customerInfo));
  return async () => {
    await mod.Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: id });
  };
}

export function customerHasPro(customerInfo: any) {
  const entitlements = customerInfo?.entitlements?.active ?? {};
  return Boolean(entitlements?.[REVENUECAT_PRO_ENTITLEMENT]);
}

export async function purchaseProMonthly() {
  const mod = await getPurchasesModule();
  if (!mod) throw new Error('Not supported on web');
  const { offerings } = await mod.Purchases.getOfferings();
  const current = offerings?.current;
  const packages = current?.availablePackages ?? [];
  const monthly =
    packages.find((p: any) => p?.identifier === '$rc_monthly') ??
    packages.find((p: any) => String(p?.product?.identifier ?? '').toLowerCase().includes('monthly')) ??
    packages[0];
  if (!monthly) throw new Error('No packages available');
  const { customerInfo } = await mod.Purchases.purchasePackage({ aPackage: monthly });
  return customerInfo ?? null;
}

export async function restorePurchases() {
  const mod = await getPurchasesModule();
  if (!mod) throw new Error('Not supported on web');
  const customerInfo = await mod.Purchases.restorePurchases();
  return customerInfo ?? null;
}
