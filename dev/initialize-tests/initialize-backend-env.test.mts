import { writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupWorktreeDirs,
  makeWorktreeDir,
  runInitializeHelper,
} from '../test-helpers/initialize.mts'

// Baseline shell state write_worktree_env needs under `set -euo pipefail`:
// enough for the DATABASE_URL/port export lines, without pre-seeding any of
// the web-only configurer outputs (CF_WORKER_SECRET, WEB_PUSH_*,
// EFFECTIVE_TURNSTILE_*, NODE_EXTRA_CA_CERTS) — those are declared per test
// below to simulate whether this run's own (mode-gated) configurers ran.
const BASELINE_ENV_VARS = `
WORKTREE_DIR=$(worktree_resource_current_dir "$PWD")
DB_NAME=voucha_test
VALKEY_CONTAINER=voucha-valkey-test
VALKEY_PORT=56379
BACKEND_PORT=53001
NEXT_PORT=53002
WORKER_PORT=53003
IMAGE_LAMBDA_PORT=53004
STORYBOOK_PORT=53005
INSPECTOR_PORT=53006
API_KEY_CHECKSUM_SECRET=checksum
VOUCHA_OTP_TOKEN_HASH_SECRET=otp
VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
unset DATABASE_URL
`

async function writeWorktreeEnv(cwd: string, mode: string, extraShellVars = '') {
  return runInitializeHelper({
    cwd,
    script: `${BASELINE_ENV_VARS}MODE=${mode}\n${extraShellVars}write_worktree_env >/dev/null\ncat .env`,
  })
}

describe('write_worktree_env backend/web anti-drift', () => {
  afterEach(cleanupWorktreeDirs)

  const WEB_ONLY_SECRETS = [
    'CF_WORKER_SECRET',
    'WEB_PUSH_PUBLIC_KEY',
    'WEB_PUSH_PRIVATE_KEY',
    'WEB_PUSH_SUBJECT',
    'CLOUDFLARE_TURNSTILE_SECRET_KEY',
    'NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY',
  ]

  it('produces real .env output for a fresh backend init', async () => {
    const cwd = await makeWorktreeDir('feature-fresh-backend-env-sanity')

    const env = await writeWorktreeEnv(cwd, 'backend')

    // Guards the omission assertions below against passing vacuously if the
    // run silently produced empty/failed output.
    expect(env).toContain('export PORT=53001')
  })

  it.each(WEB_ONLY_SECRETS)('omits %s from .env on a fresh backend init', async name => {
    const cwd = await makeWorktreeDir('feature-fresh-backend-env')

    const env = await writeWorktreeEnv(cwd, 'backend')

    expect(env).not.toContain(`export ${name}=`)
  })

  it('writes NODE_EXTRA_CA_CERTS in backend mode but never in web mode', async () => {
    const backendCwd = await makeWorktreeDir('feature-backend-ca-certs')
    const webCwd = await makeWorktreeDir('feature-web-ca-certs')
    const extra = 'NODE_EXTRA_CA_CERTS=/fake/ca.pem\n'

    const [backendEnv, webEnv] = await Promise.all([
      writeWorktreeEnv(backendCwd, 'backend', extra),
      writeWorktreeEnv(webCwd, 'web', extra),
    ])

    // Backend mode has no later mkcert block, so write_worktree_env is the
    // sole writer and must preserve a shell-set value itself (see the
    // comment above the NODE_EXTRA_CA_CERTS resolution in write_worktree_env).
    expect(backendEnv).toMatch(/export NODE_EXTRA_CA_CERTS=.*fake\/ca\.pem/)
    // Web mode deliberately never resolves/writes it here at all — main()'s
    // mkcert block is its sole writer, re-deriving from a live `mkcert
    // -CAROOT` later. A stray write here would make that block's
    // already-exported guard skip re-deriving and silently keep this value.
    expect(webEnv).not.toContain('NODE_EXTRA_CA_CERTS')
  })

  it('preserves prior web secrets across a backend-mode refresh', async () => {
    const cwd = await makeWorktreeDir('feature-backend-refresh-preserves-web-secrets')
    await writeFile(
      `${cwd}/.env`,
      `export CF_WORKER_SECRET=oldsecret
export WEB_PUSH_PUBLIC_KEY=oldpub
export WEB_PUSH_PRIVATE_KEY=oldpriv
export WEB_PUSH_SUBJECT=mailto:old@voucha.ai
export CLOUDFLARE_TURNSTILE_SECRET_KEY=oldts
export NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=oldtssite
`,
    )

    // Backend mode never runs configure_cf_worker_secret/configure_web_push_keys/
    // configure_turnstile_keys, so none of these shell vars are declared this
    // run — resolve_preserved_env_var must fall back to the prior .env instead
    // of silently dropping a previously-web worktree's secrets.
    const env = await writeWorktreeEnv(cwd, 'backend')

    expect(env).toMatch(/export CF_WORKER_SECRET=.*oldsecret/)
    expect(env).toMatch(/export WEB_PUSH_PUBLIC_KEY=.*oldpub/)
    expect(env).toMatch(/export WEB_PUSH_PRIVATE_KEY=.*oldpriv/)
    expect(env).toMatch(/export WEB_PUSH_SUBJECT=.*mailto:old@voucha\.ai/)
    expect(env).toMatch(/export CLOUDFLARE_TURNSTILE_SECRET_KEY=.*oldts\b/)
    expect(env).toMatch(/export NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=.*oldtssite/)
  })

  it('ignores a live CF_WORKER_SECRET during a backend-mode refresh', async () => {
    const cwd = await makeWorktreeDir('feature-backend-refresh-ignores-live-cf-secret')
    await writeFile(`${cwd}/.env`, 'export CF_WORKER_SECRET=storedsecret\n')

    // Simulates ~/voucha.env changing between web-init and a later backend
    // refresh: the gate-1186 block sources it into this top-level shell
    // unconditionally at every mode >= backend, so CF_WORKER_SECRET can be
    // declared here even though configure_cf_worker_secret (web-only) never
    // ran this run. Backend mode never runs write_worker_env/write_web_env_local,
    // so adopting this live value into .env alone would desync it from the
    // untouched cloudflare-worker/.dev.vars and web/.env.local.
    const env = await writeWorktreeEnv(cwd, 'backend', 'CF_WORKER_SECRET=livesecret\n')

    expect(env).toMatch(/export CF_WORKER_SECRET=.*storedsecret/)
    expect(env).not.toContain('livesecret')
  })
})

describe('resolve_preserved_env_var', () => {
  afterEach(cleanupWorktreeDirs)

  it('prefers an intentionally empty shell value over a non-empty .env fallback', async () => {
    const cwd = await makeWorktreeDir('feature-resolve-prefers-empty-shell')
    await writeFile(`${cwd}/.env`, 'export FOO=fromenv\n')

    const output = await runInitializeHelper({
      cwd,
      script: `FOO=''\nresolve_preserved_env_var FOO`,
    })

    expect(output).toBe('')
  })

  it('falls back to .env when this run never declared the shell variable', async () => {
    const cwd = await makeWorktreeDir('feature-resolve-falls-back-to-env')
    await writeFile(`${cwd}/.env`, 'export FOO=fromenv\n')

    const output = await runInitializeHelper({
      cwd,
      script: `resolve_preserved_env_var FOO`,
    })

    expect(output).toBe('fromenv')
  })

  it('reads a differently-named .env key via the optional second argument', async () => {
    const cwd = await makeWorktreeDir('feature-resolve-env-key-argument')
    await writeFile(`${cwd}/.env`, 'export BAZ=frombaz\n')

    const output = await runInitializeHelper({
      cwd,
      script: `resolve_preserved_env_var BAR BAZ`,
    })

    expect(output).toBe('frombaz')
  })
})
