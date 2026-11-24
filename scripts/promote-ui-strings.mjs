#!/usr/bin/env node

/**
 * Otzar Sefarim - Autonomous UI Strings Promotion Script
 * Runs inside GitHub Actions (Desktop & Mobile) before builds.
 *
 * 1. Checks if FIREBASE_SERVICE_ACCOUNT_JSON is configured in GitHub Secrets.
 *    If missing/empty, gracefully skips without failing the build.
 * 2. Connects to Firestore REST API via Google OAuth2 service account JWT (pure Node.js crypto, zero extra npm deps).
 * 3. Pulls all documents from 'ui_strings' collection.
 * 4. Filters entries where promoted_desktop == false (on Desktop) or promoted_mobile == false (on Mobile).
 * 5. Validates parameters and syntax (skips malformed rows safely).
 * 6. Injects valid overrides into shared/strings/dictionary.ts.
 * 7. Runs TypeScript validation (npx tsc --noEmit). If TS fails, rolls back safely.
 * 8. Commits & pushes the updated dictionary to main with [skip ci].
 * 9. Marks the overrides as promoted in Firestore so they won't be re-applied.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DICTIONARY_PATH = path.join(REPO_ROOT, 'shared', 'strings', 'dictionary.ts');

// Determine platform: --platform desktop | --platform mobile
const args = process.argv.slice(2);
let platform = 'desktop';
const platIdx = args.indexOf('--platform');
if (platIdx !== -1 && args[platIdx + 1]) {
  platform = args[platIdx + 1].toLowerCase().includes('mob') ? 'mobile' : 'desktop';
} else if (process.env.BUILD_PLATFORM) {
  platform = process.env.BUILD_PLATFORM.toLowerCase().includes('mob') ? 'mobile' : 'desktop';
}

console.log(`[promote-ui-strings] Target platform: ${platform}`);

const rawSaJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (!rawSaJson) {
  console.log('[promote-ui-strings] Notice: FIREBASE_SERVICE_ACCOUNT_JSON secret is not set.');
  console.log('[promote-ui-strings] Skipping live strings promotion. Build will proceed with source dictionary.');
  process.exit(0);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(rawSaJson);
  if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
    throw new Error('Service account JSON must contain client_email, private_key, and project_id');
  }
} catch (err) {
  console.warn('[promote-ui-strings] Warning: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
  console.warn('[promote-ui-strings] Skipping live strings promotion safely.');
  process.exit(0);
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(dataToSign);
  const signature = signer.sign(sa.private_key);
  const jwt = `${dataToSign}.${base64url(signature)}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  }).toString();

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OAuth2 token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchUiStringsDocs(projectId, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/ui_strings?pageSize=500`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore list documents failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const docs = data.documents || [];
  return docs.map((d) => {
    const f = d.fields || {};
    const nameParts = d.name.split('/');
    const docId = nameParts[nameParts.length - 1];
    return {
      docId,
      fullPath: d.name,
      key: f.key?.stringValue || docId,
      value: f.value?.stringValue || '',
      promoted_desktop: Boolean(f.promoted_desktop?.booleanValue),
      promoted_mobile: Boolean(f.promoted_mobile?.booleanValue),
    };
  });
}

async function markDocAsPromoted(projectId, accessToken, docId, targetPlatform) {
  const fieldName = targetPlatform === 'mobile' ? 'promoted_mobile' : 'promoted_desktop';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/ui_strings/${encodeURIComponent(docId)}?updateMask.fieldPaths=${fieldName}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        [fieldName]: { booleanValue: true },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[promote-ui-strings] Warning: Failed to mark doc ${docId} as promoted in Firestore: ${text}`);
  }
}

function extractPlaceholders(str) {
  const matches = str.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  return new Set(matches.map((m) => m.slice(1, -1)));
}

function validateOverride(key, overrideValue, defaultValue) {
  if (typeof overrideValue !== 'string' || !overrideValue.trim()) return false;
  if (overrideValue.length > 1000) return false;
  const openCount = (overrideValue.match(/\{/g) || []).length;
  const closeCount = (overrideValue.match(/\}/g) || []).length;
  if (openCount !== closeCount) return false;

  const defaultParams = extractPlaceholders(defaultValue);
  const overrideParams = extractPlaceholders(overrideValue);
  for (const p of defaultParams) {
    if (!overrideParams.has(p)) return false;
  }
  return true;
}

function patchDictionaryFile(content, key, newValue) {
  const parts = key.split('.');
  if (parts.length !== 2) return content;
  const [ns, prop] = parts;

  // Locate the namespace block: `ns: { ... }`
  const nsRegex = new RegExp(`(\\b${ns}\\s*:\\s*\\{)([\\s\\S]*?)(\\n  \\},)`, 'm');
  const nsMatch = content.match(nsRegex);
  if (!nsMatch) return content;

  const nsBody = nsMatch[2];
  // Match `prop: "..."` or `prop: '...'` or with trailing comma
  const propRegex = new RegExp(`(\\n\\s*${prop}\\s*:\\s*)(['"\`][\\s\\S]*?['"\`])(,)`, 'm');
  if (!propRegex.test(nsBody)) {
    return content;
  }

  const replacementValue = JSON.stringify(newValue);
  const newNsBody = nsBody.replace(propRegex, `$1${replacementValue}$3`);
  return content.replace(nsRegex, `$1${newNsBody}$3`);
}

async function main() {
  if (!fs.existsSync(DICTIONARY_PATH)) {
    console.error(`[promote-ui-strings] Error: dictionary not found at ${DICTIONARY_PATH}`);
    process.exit(0);
  }

  console.log('[promote-ui-strings] Authenticating with Google OAuth2 for Firestore...');
  const accessToken = await getGoogleAccessToken(serviceAccount);
  console.log('[promote-ui-strings] Authenticated successfully. Fetching ui_strings...');

  const docs = await fetchUiStringsDocs(serviceAccount.project_id, accessToken);
  console.log(`[promote-ui-strings] Found ${docs.length} total overrides in Firestore.`);

  const unpromoted = docs.filter((d) =>
    platform === 'mobile' ? !d.promoted_mobile : !d.promoted_desktop
  );

  console.log(`[promote-ui-strings] Found ${unpromoted.length} unpromoted overrides for ${platform}.`);
  if (unpromoted.length === 0) {
    console.log('[promote-ui-strings] Nothing to promote. Exiting cleanly.');
    process.exit(0);
  }

  // Read current dictionary content and extract DEFAULT_STRINGS
  let dictContent = fs.readFileSync(DICTIONARY_PATH, 'utf8');
  const origContent = dictContent;

  const appliedDocIds = [];

  for (const item of unpromoted) {
    const { docId, key, value } = item;
    if (!key || typeof value !== 'string') continue;

    // Check if key exists in dictionary
    const parts = key.split('.');
    if (parts.length !== 2) {
      console.warn(`[promote-ui-strings] Skipping invalid key format: ${key}`);
      continue;
    }
    const [ns, prop] = parts;
    const testRegex = new RegExp(`\\b${ns}\\s*:[\\s\\S]*?\\b${prop}\\s*:\\s*(['"\`][\\s\\S]*?['"\`])`);
    const match = dictContent.match(testRegex);
    if (!match) {
      console.warn(`[promote-ui-strings] Key ${key} not found in dictionary.ts, skipping.`);
      continue;
    }

    let defaultVal = '';
    try {
      defaultVal = eval(match[1]); // extracts clean string from literal
    } catch {
      defaultVal = match[1].slice(1, -1);
    }

    if (!validateOverride(key, value, defaultVal)) {
      console.warn(`[promote-ui-strings] Skipping invalid override for ${key} (placeholder or syntax error).`);
      continue;
    }

    const patched = patchDictionaryFile(dictContent, key, value);
    if (patched !== dictContent) {
      dictContent = patched;
      appliedDocIds.push({ docId, key, value });
      console.log(`[promote-ui-strings] Injected override for ${key}`);
    }
  }

  if (appliedDocIds.length === 0) {
    console.log('[promote-ui-strings] No eligible overrides could be patched. Exiting.');
    process.exit(0);
  }

  // Write updated dictionary
  fs.writeFileSync(DICTIONARY_PATH, dictContent, 'utf8');

  // Verify TypeScript compilation
  console.log('[promote-ui-strings] Running TypeScript verification on patched dictionary...');
  try {
    execSync('npx tsc --noEmit', { cwd: REPO_ROOT, stdio: 'inherit' });
    console.log('[promote-ui-strings] TypeScript verification passed successfully!');
  } catch (tsErr) {
    console.error('[promote-ui-strings] TypeScript check failed after patching! Rolling back dictionary.');
    fs.writeFileSync(DICTIONARY_PATH, origContent, 'utf8');
    process.exit(0); // Exit 0 so build doesn't break
  }

  // Check git diff
  let hasGitChanges = false;
  try {
    const status = execSync('git status --porcelain shared/strings/dictionary.ts', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    hasGitChanges = status.length > 0;
  } catch (gitErr) {
    console.warn('[promote-ui-strings] Git check warning:', gitErr.message);
  }

  if (hasGitChanges) {
    console.log(`[promote-ui-strings] Committing ${appliedDocIds.length} promoted overrides to git...`);
    try {
      execSync('git config user.name "github-actions[bot]"', { cwd: REPO_ROOT });
      execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: REPO_ROOT });
      execSync('git add shared/strings/dictionary.ts', { cwd: REPO_ROOT });
      const keysSummary = appliedDocIds.map((a) => a.key).slice(0, 5).join(', ');
      const msg = `chore(strings): promote ${appliedDocIds.length} live overrides to source (${keysSummary}) [skip ci]`;
      execSync(`git commit -m "${msg}"`, { cwd: REPO_ROOT });
      execSync('git pull --rebase origin main || true', { cwd: REPO_ROOT });
      execSync('git push origin HEAD:main', { cwd: REPO_ROOT });
      console.log('[promote-ui-strings] Pushed promoted dictionary commit to main.');
    } catch (pushErr) {
      console.warn('[promote-ui-strings] Git commit/push warning:', pushErr.message);
    }
  }

  // Mark promoted in Firestore
  console.log(`[promote-ui-strings] Marking ${appliedDocIds.length} entries as promoted in Firestore...`);
  for (const { docId } of appliedDocIds) {
    await markDocAsPromoted(serviceAccount.project_id, accessToken, docId, platform);
  }
  console.log('[promote-ui-strings] Done! Build will now proceed with up-to-date source dictionary.');
}

main().catch((err) => {
  console.error('[promote-ui-strings] Unhandled error during promotion:', err);
  // Do not crash the entire GitHub Actions build
  process.exit(0);
});
