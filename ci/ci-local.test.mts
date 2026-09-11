import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { assertWorkflowCommandDrift, getCiLocalTargets } from './ci-local.mts'
import type { CiLocalTarget } from './ci-local/types.mts'

describe('ci-local', () => {
  const execFileAsync = promisify(execFile)
  const scriptPath = fileURLToPath(new URL('ci-local.mts', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeWorkflowRepo(contents: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-ci-local-'))
    testDirs.push(dir)
    await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
    await writeFile(join(dir, '.github', 'workflows', 'test.yml'), contents)
    return dir
  }

  describe('ci/ci-local.mts', () => {
    it('lists the supported local CI targets', async () => {
      const { stdout } = await execFileAsync('node', [scriptPath, '--list'])

      expect(stdout).toContain('static - ')
      expect(stdout).toContain('backend-smoke - ')
      expect(stdout).toContain('web-api - ')
      expect(stdout).toContain('web-integration - ')
      expect(stdout).toContain('postgres-schema - ')
    })

    it('prints inert help and rejects unknown flags, mixed help, and multiple targets', async () => {
      const help = await execFileAsync(process.execPath, [scriptPath, '--help'])
      expect(help.stdout).toContain('Usage:')

      for (const args of [['--wat'], ['--help', 'static'], ['static', 'backend-smoke']]) {
        await expect(execFileAsync(process.execPath, [scriptPath, ...args])).rejects.toMatchObject({
          code: 1,
        })
      }
    })

    it('rejects --dry-run without a target', async () => {
      await expect(
        execFileAsync(process.execPath, [scriptPath, '--dry-run']),
      ).rejects.toMatchObject({ code: 1 })
    })

    it('splits API database setup from full-stack web integration in dry-run mode', async () => {
      const api = await execFileAsync('node', [scriptPath, 'web-api', '--dry-run'])
      const { stdout } = await execFileAsync('node', [scriptPath, 'web-integration', '--dry-run'])

      expect(api.stdout).toContain('cd backend && node data-stores/psql/migrate.mts')
      expect(api.stdout).toContain('--project web-api')
      expect(api.stdout).not.toContain('setup-web-integration')
      expect(api.stdout).not.toContain('--project web-integration')
      expect(api.stdout).not.toContain('--coverage')
      expect(stdout).toContain('node ci/setup-web-integration.mts')
      expect(stdout).toContain('unset CF_WORKER_SECRET')
      expect(stdout).toContain('--project web-integration')
      expect(stdout).not.toContain('--project web-api')
      expect(stdout).not.toContain('--coverage')
    })

    it('prints backend-smoke local environment setup in dry-run mode', async () => {
      const { stdout } = await execFileAsync('node', [scriptPath, 'backend-smoke', '--dry-run'])

      expect(stdout).toContain('if [ -f .env ]; then source .env; fi')
      expect(stdout).toContain('PORT=$(python3 ci/allocate-browser-safe-ports.py 1)')
      expect(stdout).not.toContain('NODE_V8_COVERAGE')
      expect(stdout).toContain('./scripts/tests/smoke-test-server.sh')
      expect(stdout).toContain('./scripts/tests/smoke-test-worker.sh')
    })

    it('fails drift detection when a registered workflow command is absent', async () => {
      const dir = await makeWorkflowRepo('name: test\n')
      const target: CiLocalTarget = {
        description: 'test',
        commands: [
          {
            command: 'echo local',
            description: 'local test',
            source: {
              workflow: '.github/workflows/test.yml',
              contains: 'echo remote',
            },
          },
        ],
      }

      expect(() => assertWorkflowCommandDrift({ static: target }, dir)).toThrow(
        'ci-local drift: local test command was not found',
      )
    })

    it('checks every expected workflow command when drift detection has multiple source lines', async () => {
      const dir = await makeWorkflowRepo('echo first\n')
      const target: CiLocalTarget = {
        description: 'test',
        commands: [
          {
            command: 'echo first && echo second',
            description: 'multi-line drift test',
            source: {
              workflow: '.github/workflows/test.yml',
              contains: ['echo first', 'echo second'],
            },
          },
        ],
      }

      expect(() => assertWorkflowCommandDrift({ static: target }, dir)).toThrow(
        'ci-local drift: multi-line drift test command was not found',
      )
    })

    it('has no drift between the real ci-local targets and the real GitHub Actions workflow files', () => {
      const repoRoot = fileURLToPath(new URL('..', import.meta.url))

      expect(() => assertWorkflowCommandDrift(getCiLocalTargets(), repoRoot)).not.toThrow()
    })

    it('prints postgres schema migration and test commands in dry-run mode', async () => {
      const { stdout } = await execFileAsync('node', [scriptPath, 'postgres-schema', '--dry-run'])

      expect(stdout).toContain('set -a; source .env; set +a')
      expect(stdout).toContain('export READ_DATABASE_URL="$DATABASE_URL"')
      expect(stdout).toContain('pnpm --dir backend run db:clean')
      expect(stdout).toContain('cd backend && node data-stores/psql/migrate.mts')
      expect(stdout).toContain(
        'VITEST_MAX_WORKERS=1 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity',
      )
    })

    it('includes public static analysis commands', () => {
      const commands = getCiLocalTargets().static.commands.map(command => command.command)

      expect(commands).toContain('pnpm run no-mistakes')
      expect(commands).not.toContainEqual(expect.stringContaining('no-mistakes playwright check'))
    })

    it('keeps command metadata available for all targets', () => {
      const targets = getCiLocalTargets()

      expect(Object.values(targets).every(target => target.commands.length > 0)).toBe(true)
      expect(
        targets['web-integration'].commands.some(command =>
          command.command.includes('unset CF_WORKER_SECRET'),
        ),
      ).toBe(true)
      expect(targets['web-api'].commands.some(command => command.command.includes('web-api'))).toBe(
        true,
      )
    })
  })
})
