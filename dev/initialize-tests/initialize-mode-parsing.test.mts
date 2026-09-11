import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script, home }: { cwd: string; script: string; home?: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

// Matches worktree_resource_validate_web_init's contract exactly (see
// worktree-resource-env-web-init.test.mts): a stricter web-init check now sits
// on top of the backend-level check, requiring cloudflare-worker/.dev.vars and
// web/.env.local with ports matching .env. Writing only backend-level fields
// here would make worktree_validated_capability report "backend", not "web",
// which would silently break the "preserves web capability" test below by
// making it exercise the wrong rung of the ladder.
const WEB_PORTS = { backend: '4001', next: '4002', worker: '4003', imageLambda: '4004' }

async function writeWebResourceMetadata(cwd: string, worktreeDir = cwd.split('/').at(-1)) {
  await writeFile(
    join(cwd, '.env'),
    `WORKTREE_DIR=${worktreeDir}
DATABASE_URL=postgresql://localhost/voucha-test
VALKEY_CONTAINER=voucha-valkey-test
PORT=${WEB_PORTS.backend}
NEXT_PORT=${WEB_PORTS.next}
WORKER_PORT=${WEB_PORTS.worker}
IMAGE_LAMBDA_PORT=${WEB_PORTS.imageLambda}
`,
  )
  await writeFile(join(cwd, '.valkey-port'), '6379\n')
  await mkdir(join(cwd, 'cloudflare-worker'), { recursive: true })
  await writeFile(
    join(cwd, 'cloudflare-worker', '.dev.vars'),
    `BACKEND_ORIGIN=http://localhost:${WEB_PORTS.backend}\nWEB_ORIGIN=http://localhost:${WEB_PORTS.next}\n`,
  )
  await mkdir(join(cwd, 'web'), { recursive: true })
  await writeFile(
    join(cwd, 'web', '.env.local'),
    `SITEMAP_BASE_URL=http://localhost:${WEB_PORTS.worker}\nIMAGE_ORIGIN=http://localhost:${WEB_PORTS.imageLambda}\n`,
  )
}

describe('initialize mode parsing', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  describe('dev/initialize mode parsing', () => {
    it('print_usage outputs all three modes', async () => {
      const output = await runHelper({
        cwd: await makeWorktreeDir('feature-usage'),
        script: `print_usage`,
      })

      expect(output).toContain('monorepo')
      expect(output).toContain('backend')
      expect(output).toContain('web')
    })

    it('prints sandbox guidance when Docker daemon is unreachable', async () => {
      const output = await runHelper({
        cwd: await makeWorktreeDir('feature-docker-sandbox-guidance'),
        script: `print_docker_daemon_error`,
      })

      expect(output).toContain('Docker daemon is not reachable or not running')
      expect(output).toContain('If Docker Desktop is stopped, start it and try again')
      expect(output).toContain('rerun ./dev/initialize web without sandboxing')
    })

    it('records monorepo capability after fresh monorepo initialization', async () => {
      const cwd = await makeWorktreeDir('feature-marker-monorepo')

      await runHelper({ cwd, script: `persist_initialization_capability monorepo "$PWD"` })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('monorepo')
    })

    it('records web capability after fresh web initialization', async () => {
      const cwd = await makeWorktreeDir('feature-marker-web')

      await runHelper({ cwd, script: `persist_initialization_capability web "$PWD"` })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('web')
    })

    it('records backend capability after fresh backend initialization', async () => {
      const cwd = await makeWorktreeDir('feature-marker-backend')

      await runHelper({ cwd, script: `persist_initialization_capability backend "$PWD"` })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('backend')
    })

    it('upgrades monorepo capability to web', async () => {
      const cwd = await makeWorktreeDir('feature-upgrade-marker')
      await writeFile(join(cwd, '.initialized'), 'monorepo\n')

      await runHelper({ cwd, script: `persist_initialization_capability web "$PWD"` })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('web')
    })

    it('preserves web capability after monorepo initialization', async () => {
      const cwd = await makeWorktreeDir('feature-preserve-web-marker')
      await writeFile(join(cwd, '.initialized'), 'web\n')
      await writeWebResourceMetadata(cwd)

      // Piped, not space-joined: PRESERVED_CAPABILITY can legitimately be the
      // empty string, and runHelper trims the whole output, which would
      // otherwise swallow a trailing space and make "monorepo " and
      // "monorepo" indistinguishable.
      const output = await runHelper({
        cwd,
        script: `persist_initialization_capability monorepo "$PWD"; printf '%s|%s' "$INITIALIZED_CAPABILITY" "$PRESERVED_CAPABILITY"`,
      })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('web')
      expect(output).toBe('web|web')
    })

    it('demotes web capability to backend when only backend resources are valid', async () => {
      const cwd = await makeWorktreeDir('feature-partial-web-resources')
      await writeFile(join(cwd, '.initialized'), 'web\n')
      // Backend-level resources only (no cloudflare-worker/.dev.vars or
      // web/.env.local): worktree_resource_validate_web_init now requires
      // both, so the strongest capability still valid on disk is "backend".
      await writeFile(
        join(cwd, '.env'),
        `WORKTREE_DIR=${cwd.split('/').at(-1)}\nDATABASE_URL=postgresql://localhost/voucha-test\nVALKEY_CONTAINER=voucha-valkey-test\n`,
      )
      await writeFile(join(cwd, '.valkey-port'), '6379\n')

      const output = await runHelper({
        cwd,
        script: `persist_initialization_capability monorepo "$PWD"; printf '%s|%s' "$INITIALIZED_CAPABILITY" "$PRESERVED_CAPABILITY"`,
      })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('backend')
      expect(output).toBe('backend|backend')
    })

    it('demotes web capability to backend when web/.env.local ports have gone stale', async () => {
      const cwd = await makeWorktreeDir('feature-stale-web-ports')
      await writeFile(join(cwd, '.initialized'), 'web\n')
      // Files present (unlike the missing-metadata case above), but
      // web/.env.local's ports no longer match .env — the same "re-rolled
      // port" scenario worktree_resource_validate_web_init rejects with
      // WORKTREE_RESOURCE_STATUS=stale-web-ports (see
      // worktree-resource-env-web-init.test.mts). Backend-level resources are
      // still valid, so the strongest capability still valid on disk is
      // "backend", not "monorepo".
      await writeWebResourceMetadata(cwd)
      await writeFile(
        join(cwd, 'web', '.env.local'),
        `SITEMAP_BASE_URL=http://localhost:9999\nIMAGE_ORIGIN=http://localhost:${WEB_PORTS.imageLambda}\n`,
      )

      const output = await runHelper({
        cwd,
        script: `persist_initialization_capability monorepo "$PWD"; printf '%s|%s' "$INITIALIZED_CAPABILITY" "$PRESERVED_CAPABILITY"`,
      })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('backend')
      expect(output).toBe('backend|backend')
    })

    it('demotes web capability to monorepo when resource metadata is missing', async () => {
      const cwd = await makeWorktreeDir('feature-missing-web-resources')
      await writeFile(join(cwd, '.initialized'), 'web\n')

      const output = await runHelper({
        cwd,
        script: `persist_initialization_capability monorepo "$PWD"; printf '%s|%s' "$INITIALIZED_CAPABILITY" "$PRESERVED_CAPABILITY"`,
      })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('monorepo')
      expect(output).toBe('monorepo|')
    })

    it('demotes web capability to monorepo when resource metadata belongs to another worktree', async () => {
      const cwd = await makeWorktreeDir('feature-stale-web-resources')
      await writeFile(join(cwd, '.initialized'), 'web\n')
      await writeWebResourceMetadata(cwd, 'another-worktree')

      const output = await runHelper({
        cwd,
        script: `persist_initialization_capability monorepo "$PWD"; printf '%s|%s' "$INITIALIZED_CAPABILITY" "$PRESERVED_CAPABILITY"`,
      })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('monorepo')
      expect(output).toBe('monorepo|')
    })

    it('normalizes an invalid marker to the requested capability', async () => {
      const cwd = await makeWorktreeDir('feature-invalid-marker')
      await writeFile(join(cwd, '.initialized'), 'w eb\n')

      await runHelper({ cwd, script: `persist_initialization_capability monorepo "$PWD"` })

      expect((await readFile(join(cwd, '.initialized'), 'utf8')).trim()).toBe('monorepo')
    })

    it('directs a preserved web worktree to tmux after a monorepo refresh', async () => {
      const output = await runHelper({
        cwd: await makeWorktreeDir('feature-preserved-web-summary'),
        script: `PRESERVED_CAPABILITY=web; print_lower_mode_next_steps monorepo`,
      })

      expect(output).toContain('Web capability remains available after this monorepo refresh')
      expect(output).toContain('source .env')
      expect(output).toContain('Start services: ./dev/tmux')
      expect(output).not.toContain('./dev/initialize web')
    })

    it('directs a preserved backend worktree to DB/Valkey-backed tests after a monorepo refresh', async () => {
      const output = await runHelper({
        cwd: await makeWorktreeDir('feature-preserved-backend-summary'),
        script: `PRESERVED_CAPABILITY=backend; print_lower_mode_next_steps monorepo`,
      })

      expect(output).toContain(
        'Backend capability (DB + Valkey) remains available after this monorepo refresh',
      )
      expect(output).toContain('source .env')
      expect(output).toContain('./dev/initialize web for the full stack')
    })

    it('monorepo mode does not write .env or .valkey-port', async () => {
      const cwd = await makeWorktreeDir('feature-monorepo-no-env')

      await runHelper({
        cwd,
        script: `persist_initialization_capability monorepo "$PWD"`,
      })

      expect(await fileExists(join(cwd, '.initialized'))).toBe(true)
      expect(await fileExists(join(cwd, '.env'))).toBe(false)
      expect(await fileExists(join(cwd, '.valkey-port'))).toBe(false)
    })
  })
})
