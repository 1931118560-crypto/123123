import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const failures = [];
const warnings = [];
const passes = [];

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function readUtf8(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function pushResult(ok, message, level = 'fail') {
  if (ok) {
    passes.push(message);
    return;
  }
  if (level === 'warn') warnings.push(message);
  else failures.push(message);
}

function parseDotEnv(content) {
  const output = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

function listBasenames(absDir) {
  if (!fs.existsSync(absDir)) return [];
  return fs.readdirSync(absDir).filter((name) => !name.startsWith('.')).sort();
}

function isHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

function extractMatch(content, pattern) {
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? '';
}

const envLocalPath = path.join(root, '.env.local');
const envLocal = fs.existsSync(envLocalPath) ? parseDotEnv(fs.readFileSync(envLocalPath, 'utf8')) : {};
const env = { ...envLocal, ...process.env };

const requiredFiles = [
  'dist/index.html',
  'ios/App/App/public/index.html',
  'ios/App/App/Info.plist',
  'ios/App/App.xcodeproj/project.pbxproj',
  'public/legal/privacy-policy.html',
  'public/legal/terms-of-service.html',
  'supabase/functions/deepseek/index.ts',
  'supabase/functions/minimax-tts/index.ts',
  'supabase/functions/iflytek-auth/index.ts',
  'supabase/functions/revenuecat-webhook/index.ts',
  'supabase/functions/account-delete/index.ts'
];

for (const relPath of requiredFiles) {
  pushResult(exists(relPath), `Required file exists: ${relPath}`);
}

const requiredEnvKeys = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_REVENUECAT_IOS_API_KEY',
  'VITE_PRIVACY_POLICY_URL',
  'VITE_TERMS_OF_SERVICE_URL'
];

for (const key of requiredEnvKeys) {
  const val = String(env[key] ?? '').trim();
  pushResult(Boolean(val), `Required env is set: ${key}`);
}

const privacyUrl = String(env.VITE_PRIVACY_POLICY_URL ?? '').trim();
const termsUrl = String(env.VITE_TERMS_OF_SERVICE_URL ?? '').trim();
const subscriptionTermsUrl = String(env.VITE_SUBSCRIPTION_TERMS_URL ?? '').trim();

if (privacyUrl) {
  pushResult(
    isHttpsUrl(privacyUrl),
    'VITE_PRIVACY_POLICY_URL is a public HTTPS URL',
    'fail'
  );
}
if (termsUrl) {
  pushResult(
    isHttpsUrl(termsUrl),
    'VITE_TERMS_OF_SERVICE_URL is a public HTTPS URL',
    'fail'
  );
}
if (subscriptionTermsUrl) {
  pushResult(
    isHttpsUrl(subscriptionTermsUrl),
    'VITE_SUBSCRIPTION_TERMS_URL is a public HTTPS URL',
    'warn'
  );
}

const distAssets = listBasenames(path.join(root, 'dist/assets'));
const iosAssets = listBasenames(path.join(root, 'ios/App/App/public/assets'));
const assetsMatch =
  distAssets.length > 0 &&
  iosAssets.length > 0 &&
  distAssets.join('|') === iosAssets.join('|');

pushResult(
  assetsMatch,
  'iOS embedded web assets match current dist output (run pnpm run cap:sync if mismatch)'
);

const capacitorConfig = readUtf8('capacitor.config.ts');
const pbxproj = readUtf8('ios/App/App.xcodeproj/project.pbxproj');

const capacitorAppId = extractMatch(capacitorConfig, /appId:\s*['"]([^'"]+)['"]/);
const xcodeBundleId = extractMatch(pbxproj, /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/);

pushResult(Boolean(capacitorAppId), 'Capacitor appId found');
pushResult(Boolean(xcodeBundleId), 'Xcode PRODUCT_BUNDLE_IDENTIFIER found');
if (capacitorAppId && xcodeBundleId) {
  pushResult(
    capacitorAppId === xcodeBundleId,
    `Bundle ID is consistent (${capacitorAppId})`
  );
}

const infoPlist = readUtf8('ios/App/App/Info.plist');
pushResult(
  infoPlist.includes('NSMicrophoneUsageDescription'),
  'Info.plist includes NSMicrophoneUsageDescription'
);

const requiredFunctionDirs = [
  'deepseek',
  'minimax-tts',
  'iflytek-auth',
  'revenuecat-webhook',
  'account-delete'
];

for (const fnName of requiredFunctionDirs) {
  pushResult(
    exists(`supabase/functions/${fnName}/index.ts`),
    `Supabase function source exists: ${fnName}`
  );
}

console.log('\n=== MindPlan Release Preflight ===\n');

for (const msg of passes) {
  console.log(`PASS  ${msg}`);
}
for (const msg of warnings) {
  console.log(`WARN  ${msg}`);
}
for (const msg of failures) {
  console.log(`FAIL  ${msg}`);
}

console.log('\n--- Summary ---');
console.log(`PASS: ${passes.length}`);
console.log(`WARN: ${warnings.length}`);
console.log(`FAIL: ${failures.length}`);

if (failures.length > 0) {
  console.log('\nPreflight failed. Fix FAIL items before App Store submission.');
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('\nPreflight passed with warnings. Review WARN items before submission.');
  process.exit(0);
}

console.log('\nPreflight passed. Ready for final release steps.');
