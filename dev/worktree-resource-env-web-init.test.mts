import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runWorktreeResourceEnv as run } from './test-helpers/initialize.mts'

// Split out of worktree-resource-env.test.mts (which covers
// worktree_resource_is_main/validate_backend_init/refuse_shared_resources_*)
// to stay under the 300-line test-file cap once web-init coverage was added.
describe('worktree_resource_validate_web_init', () => {
  const testDirs: string[] = []

  afterEach(async () =>
    Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true }))),
  )

  async function makeToplevel() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-resource-env-'))
    testDirs.push(dir)
    return dir
  }

  async function makeIsolatedTmp() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-isolated-tmp-'))
    testDirs.push(dir)
    return dir
  }

  const PORTS = {
    backend: '4001',
    next: '4002',
    worker: '4003',
    imageLambda: '4004',
  }

  async function writeBackendEnv(gitToplevel: string, worktreeDir: string) {
    await writeFile(
      join(gitToplevel, '.env'),
      `export DATABASE_URL=postgres://localhost/${worktreeDir}
export VALKEY_CONTAINER=valkey-${worktreeDir}
export WORKTREE_DIR=${worktreeDir}
export PORT=${PORTS.backend}
export NEXT_PORT=${PORTS.next}
export WORKER_PORT=${PORTS.worker}
export IMAGE_LAMBDA_PORT=${PORTS.imageLambda}
`,
    )
    await writeFile(join(gitToplevel, '.valkey-port'), '6379\n')
  }

  async function writeWorkerEnv(gitToplevel: string, port = PORTS.backend) {
    await mkdir(join(gitToplevel, 'cloudflare-worker'), { recursive: true })
    await writeFile(
      join(gitToplevel, 'cloudflare-worker', '.dev.vars'),
      `BACKEND_ORIGIN=http://localhost:${port}
WEB_ORIGIN=http://localhost:${PORTS.next}
`,
    )
  }

  async function writeWebEnvLocal(gitToplevel: string, port = PORTS.worker) {
    await mkdir(join(gitToplevel, 'web'), { recursive: true })
    await writeFile(
      join(gitToplevel, 'web', '.env.local'),
      `SITEMAP_BASE_URL=http://localhost:${port}
IMAGE_ORIGIN=http://localhost:${PORTS.imageLambda}
`,
    )
  }

  // Uses a plain (non-grok) toplevel with isMainWorktree: true so
  // worktree_resource_current_dir resolves to a plain basename (the main-
  // checkout branch of worktree_resource_dir_from_path) — matching the
  // hardcoded WORKTREE_DIR these fixtures write to .env. A disposable-clone
  // fixture would hash the path instead, and is already covered by the
  // worktree_resource_validate_backend_init tests in worktree-resource-env.test.mts.
  it('rejects a missing cloudflare-worker/.dev.vars', async () => {
    const gitToplevel = await makeToplevel()
    const worktreeDir = basename(gitToplevel)
    await writeBackendEnv(gitToplevel, worktreeDir)
    await writeWebEnvLocal(gitToplevel)

    const { code, stdout } = await run({
      gitToplevel,
      isMainWorktree: true,
      processTmpdir: await makeIsolatedTmp(),
      script: `
        worktree_resource_validate_web_init "$(pwd -P)"
        printf '%s:%s' "$?" "$WORKTREE_RESOURCE_STATUS"
      `,
    })
    expect(code).toBe(0)
    expect(stdout).toBe('1:missing-worker-env')
  })

  it('rejects a missing web/.env.local', async () => {
    const gitToplevel = await makeToplevel()
    const worktreeDir = basename(gitToplevel)
    await writeBackendEnv(gitToplevel, worktreeDir)
    await writeWorkerEnv(gitToplevel)

    const { code, stdout } = await run({
      gitToplevel,
      isMainWorktree: true,
      processTmpdir: await makeIsolatedTmp(),
      script: `
        worktree_resource_validate_web_init "$(pwd -P)"
        printf '%s:%s' "$?" "$WORKTREE_RESOURCE_STATUS"
      `,
    })
    expect(code).toBe(0)
    expect(stdout).toBe('1:missing-web-env-local')
  })

  it('rejects a re-rolled port in web/.env.local as stale', async () => {
    const gitToplevel = await makeToplevel()
    const worktreeDir = basename(gitToplevel)
    await writeBackendEnv(gitToplevel, worktreeDir)
    await writeWorkerEnv(gitToplevel)
    await writeWebEnvLocal(gitToplevel, '9999')

    const { code, stdout } = await run({
      gitToplevel,
      isMainWorktree: true,
      processTmpdir: await makeIsolatedTmp(),
      script: `
        worktree_resource_validate_web_init "$(pwd -P)"
        printf '%s:%s' "$?" "$WORKTREE_RESOURCE_STATUS"
      `,
    })
    expect(code).toBe(0)
    expect(stdout).toBe('1:stale-web-ports')
  })

  // dev/initialize runs under `set -euo pipefail` (dev/initialize:2), inherited
  // into every `$( )` call site of this validator (e.g. persist_initialization_capability),
  // so an otherwise backend-valid .env that is simply missing a port line must
  // make this function return false, not abort the whole script on an unbound
  // variable. .env omits IMAGE_LAMBDA_PORT entirely, and worktree_resource_clear_env
  // unsets it before sourcing, so it stays genuinely unset here.
  it('reports stale-web-ports instead of aborting under set -u on a missing port var', async () => {
    const gitToplevel = await makeToplevel()
    const worktreeDir = basename(gitToplevel)
    await writeFile(
      join(gitToplevel, '.env'),
      `export DATABASE_URL=postgres://localhost/${worktreeDir}
export VALKEY_CONTAINER=valkey-${worktreeDir}
export WORKTREE_DIR=${worktreeDir}
export PORT=${PORTS.backend}
export NEXT_PORT=${PORTS.next}
export WORKER_PORT=${PORTS.worker}
`,
    )
    await writeFile(join(gitToplevel, '.valkey-port'), '6379\n')
    await writeWorkerEnv(gitToplevel)
    await writeWebEnvLocal(gitToplevel)

    const { code, stdout, stderr } = await run({
      gitToplevel,
      isMainWorktree: true,
      processTmpdir: await makeIsolatedTmp(),
      script: `
        set -u
        worktree_resource_validate_web_init "$(pwd -P)"
        printf '%s:%s' "$?" "$WORKTREE_RESOURCE_STATUS"
      `,
    })
    expect(stderr).not.toContain('unbound variable')
    expect(code).toBe(0)
    expect(stdout).toBe('1:stale-web-ports')
  })

  it('accepts matching ports across .env, .dev.vars, and web/.env.local', async () => {
    const gitToplevel = await makeToplevel()
    const worktreeDir = basename(gitToplevel)
    await writeBackendEnv(gitToplevel, worktreeDir)
    await writeWorkerEnv(gitToplevel)
    await writeWebEnvLocal(gitToplevel)

    const { code, stdout } = await run({
      gitToplevel,
      isMainWorktree: true,
      processTmpdir: await makeIsolatedTmp(),
      script: `
        worktree_resource_validate_web_init "$(pwd -P)"
        printf '%s:%s' "$?" "$WORKTREE_RESOURCE_STATUS"
      `,
    })
    expect(code).toBe(0)
    expect(stdout).toBe('0:ok')
  })
})
