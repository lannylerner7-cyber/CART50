import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'project road map.Rmd';
const start = '<!-- ROADMAP-INVENTORY:START -->';
const end = '<!-- ROADMAP-INVENTORY:END -->';
const docPath = path.join(root, name);
const original = readFileSync(docPath, 'utf8');
function normalize(text) {
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error('Roadmap inventory markers are missing');
  return text.slice(0, a + start.length) + '\n' + text.slice(b);
}
const descriptions = {
  'project road map.Rmd': 'Living architecture, readiness, roadmap and complete source inventory.',
  'replit.md': 'Collaborator instructions, operating constraints and documentation maintenance contract.',
  'Dockerfile': 'Multi-stage production website/API image; non-root runtime and HTTP health check.',
  'es.txt': 'Legacy root text asset; not an executable entrypoint; purpose requires owner review.',
  'services/vault-engine/engine.go': 'Core readiness, wallet initialization, reconciliation and engine persistence.',
  'services/vault-engine/main.go': 'Private HTTP service, authenticated routes and engine startup.',
  'services/vault-engine/payments.go': 'Payment review, signing, broadcast and transaction lifecycle.',
  'services/vault-engine/receive.go': 'Receive-address allocation and wallet receipt checks.',
  'services/vault-engine/destruction.go': 'Read-only destruction-readiness checks; no verified key erasure.',
  'services/vault-engine/replica.go': 'Durable bounded health snapshots and authenticated replication.',
  'services/vault-engine/rpc.go': 'Bitcoin Core JSON-RPC transport and cookie authentication.',
  'services/vault-engine/state.go': 'Durable engine data structures and journal state handling.',
  'artifacts/api-server/src/vault/auth.ts': 'Owner-key verification, session authentication and request protections.',
  'artifacts/api-server/src/vault/passkeys.ts': 'WebAuthn passkey enrollment, authentication and management.',
  'artifacts/api-server/src/vault/store.ts': 'Metadata persistence adapters and application-state access.',
  'artifacts/api-server/src/vault/engine.ts': 'Private signer client and node readiness adapter.',
  'artifacts/api-server/src/vault/market.ts': 'Market freshness, pricing state and alert evaluation.',
  'artifacts/api-server/src/vault/login-security.ts': 'Login attempt tracking and access restrictions.',
  'artifacts/api-server/src/vault/security-mail.ts': 'Security-event mail coordination.',
  'artifacts/api-server/src/vault/smtp.ts': 'SMTP delivery transport.',
  'artifacts/api-server/src/routes/vault.ts': 'Owner-gated vault API endpoints and contract validation.',
  'artifacts/bitcoin-vault/src/components/receive.tsx': 'Receive dialog, QR code, network warning, copy/share and readiness gating.',
  'artifacts/bitcoin-vault/src/lib/session-lock.ts': 'Client lock, protected cache clearing and cross-tab session notification.',
  'lib/api-spec/openapi.yaml': 'Authoritative HTTP API contract.',
  'lib/api-client-react/src/custom-fetch.ts': 'Client HTTP transport and request/session integration.',
  'lib/vault-cloudflare/src/index.ts': 'Cloudflare Worker price and health-replication endpoints.',
  'scripts/update-roadmap.mjs': 'Deterministic file inventory generator and stale-document check.',
};
function purpose(file) {
  if (descriptions[file]) return descriptions[file];
  const base = path.basename(file);
  if (file.startsWith('attached_assets/')) return 'Uploaded reference/evidence asset; content not reproduced here.';
  if (file.includes('/components/ui/')) return `Reusable ${base.replace(/\.tsx$/, '')} UI primitive (${file.includes('mockup') ? 'prototype sandbox' : 'wallet app'}).`;
  if (file.includes('/generated/') || file.includes('/.generated/')) return `Generated ${base} contract/registry output; update its source generator rather than hand-editing.`;
  if (file.includes('.test.') || file.endsWith('_test.go')) return `Regression tests for ${base.replace(/\.test\.[^.]+$|_test\.go$/, '')}; local checks, not hosted evidence.`;
  if (file.startsWith('docs/')) return `Detailed ${base.replace(/\.md$/, '').replaceAll('-', ' ')} runbook/status reference; respect dated evidence.`;
  if (file.startsWith('.agents/memory/')) return `Durable project decision/lesson: ${base.replace(/\.md$/, '')}.`;
  if (file.startsWith('.agents/')) return 'Workspace asset metadata; not application logic.';
  if (file.includes('/pages/')) return `${base.replace(/\.tsx$/, '').replaceAll('-', ' ')} wallet screen.`;
  if (file.includes('/mockups/')) return 'Isolated design reference; not the production wallet implementation.';
  if (file.includes('/public/')) return `Public static asset/tool: ${base}; never place generated secrets here.`;
  if (base === 'package.json') return 'Package identity, dependencies and runnable scripts.';
  if (base.startsWith('tsconfig')) return 'TypeScript compilation/project-reference configuration.';
  if (base === 'artifact.toml') return 'Managed artifact service/routing configuration; update through artifact tooling.';
  if (base === 'components.json') return 'UI component tooling and import/style configuration.';
  if (base === 'go.mod') return 'Go engine module and language version.';
  if (base === 'pnpm-lock.yaml') return 'Pinned workspace dependency resolution.';
  if (base === 'pnpm-workspace.yaml') return 'Workspace membership, dependency catalogs and package policy.';
  if (base.endsWith('.env.example')) return 'Configuration variable template; placeholders only, not installed secrets.';
  if (file.startsWith('deploy/')) return `Deployment configuration/tool: ${base}; see deployment chapter and runbooks.`;
  if (file.startsWith('scripts/')) return `Operator/build utility: ${base}; inspect flags before invoking.`;
  if (file.startsWith('lib/db/')) return 'Unused PostgreSQL starter scaffold; not the vault production store.';
  if (base === 'vite.config.ts') return 'Vite host, bundling, aliases and artifact base-path configuration.';
  if (base === 'App.tsx') return 'Application routing/providers and access boundary.';
  if (base === 'main.tsx') return 'React browser mount entrypoint.';
  if (base === 'index.css') return 'Application stylesheet and design tokens.';
  if (base === 'index.html') return 'Browser HTML shell and asset entry.';
  if (base === '.gitkeep') return 'Empty-directory placeholder.';
  if (base.startsWith('.')) return `Repository/tool configuration: ${base}.`;
  return `${base} module in ${path.dirname(file)}; see the owning subsystem above.`;
}
const raw = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  cwd: root, env: { ...process.env, DANGEROUSLY_ALLOW_GIT: '1' },
}).toString().split('\0').filter(Boolean);
const excluded = /(^|\/)(node_modules|\.git|\.local|\.cache|\.config|dist|generated-artifacts|coverage|private-deploy-keys)(\/|$)|(^|\/)\.env($|\.)|(^|\/)id_(rsa|ed25519)($|\.)|\.(pem|key|sqlite|sqlite3|db|tsbuildinfo|log)$/i;
const files = [...new Set([...raw, name])].filter(f => !excluded.test(f)).filter(f => {
  try { return lstatSync(path.join(root, f)).isFile(); } catch { return false; }
}).sort();
const rows = files.map(file => {
  const bytes = file === name ? Buffer.from(normalize(original)) : readFileSync(path.join(root, file));
  return { file, size: bytes.length, hash: createHash('sha256').update(bytes).digest('hex'), role: purpose(file) };
});
const prior = new Map([...original.matchAll(/^\| `([^`]+)` \| \d+ \| `([a-f0-9]{64})` \|/gm)].map(m => [m[1], m[2]]));
const changes = rows.filter(r => prior.get(r.file) !== r.hash).map(r => `${prior.has(r.file) ? 'Changed' : 'Added'}: ${r.file}`);
const current = new Set(files);
for (const file of prior.keys()) if (!current.has(file)) changes.push(`Removed/excluded: ${file}`);
const body = `\n\n${rows.length} files. Sizes are bytes; the roadmap size/hash excludes this generated section.\n\n| File | Bytes | SHA-256 | Responsibility |\n|---|---:|---|---|\n`
  + rows.map(r => `| \`${r.file.replaceAll('|', '&#124;')}\` | ${r.size} | \`${r.hash}\` | ${r.role.replaceAll('|', '\\|')} |`).join('\n') + '\n\n';
const a = original.indexOf(start) + start.length, b = original.indexOf(end);
normalize(original);
const updated = original.slice(0, a) + body + original.slice(b);
if (process.argv.includes('--check')) {
  if (updated !== original) {
    console.error('Roadmap inventory is stale. Update narrative, then run node scripts/update-roadmap.mjs.');
    console.error(changes.join('\n'));
    process.exitCode = 1;
  } else console.log(`Roadmap inventory current: ${rows.length} files.`);
} else {
  writeFileSync(docPath, updated);
  console.log(changes.length ? changes.join('\n') : 'No inventory changes.');
  console.log(`Updated ${name}: ${rows.length} files. Review narrative separately.`);
}
