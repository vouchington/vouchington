import assert from 'node:assert/strict'
import { access, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig, type ViteUserConfig } from 'vitest/config'
import { createVitest, type CliOptions } from 'vitest/node'
import { effectiveTimeoutCap } from './vitest-effective-timeout-cap.mts'

type Profile = {
  name: string
  admitted: boolean
  options?: CliOptions
  overrides?: ViteUserConfig
  child?: boolean
  withoutGuard?: boolean
}

const profiles: Profile[] = [
  { name: 'bounded-five', admitted: true },
  { name: 'bounded-fifteen', options: { testTimeout: 15_000 }, admitted: true },
  { name: 'bounded-thirty', options: { testTimeout: 30_000 }, admitted: true },
  { name: 'oversized-cli', options: { testTimeout: 30_001 }, admitted: false },
  { name: 'disabled-test', options: { testTimeout: 0 }, admitted: false },
  { name: 'infinite-test', options: { testTimeout: Infinity }, admitted: false },
  { name: 'disabled-hook', overrides: { test: { hookTimeout: 0 } }, admitted: false },
  { name: 'infinite-hook', overrides: { test: { hookTimeout: Infinity } }, admitted: false },
  { name: 'unused-root-zero', child: true, admitted: true },
  {
    name: 'reporter-does-not-bypass',
    options: { testTimeout: 30_001, reporters: ['json'] },
    admitted: false,
  },
  { name: 'normalized-child-hook-zero', options: { hookTimeout: 0 }, child: true, admitted: true },
  {
    name: 'removed-guard-negative',
    options: { testTimeout: 30_001 },
    withoutGuard: true,
    admitted: true,
  },
]

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return false
    throw err
  }
}

export async function checkFiniteTimeoutProfiles(repoRoot: string) {
  const cache = join(repoRoot, '.cache')
  await mkdir(cache, { recursive: true })
  const scratch = await mkdtemp(join(cache, 'effective-timeout-cap-'))
  const rows = []
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  try {
    for (const profile of profiles) {
      const root = join(scratch, profile.name)
      await cp(fileURLToPath(new URL('./fixtures/effective-timeout-cap/', import.meta.url)), root, {
        recursive: true,
      })
      const test = {
        name: 'owned-effective-timeout',
        include: ['case.mts'],
        testTimeout: 5000,
        hookTimeout: 5000,
        globalSetup: [join(root, 'setup.mts')],
      }
      const config: ViteUserConfig = {
        root,
        plugins: profile.withoutGuard ? [] : [effectiveTimeoutCap()],
        test: profile.child
          ? { testTimeout: 0, hookTimeout: 0, projects: [{ extends: true, test }] }
          : test,
      }
      let context: Awaited<ReturnType<typeof createVitest>> | undefined
      let rejected = false
      let rejection: unknown
      let result: Awaited<ReturnType<Awaited<ReturnType<typeof createVitest>>['start']>> | undefined
      const closeErrors: unknown[] = []
      try {
        context = await createVitest(
          { root, config: false, watch: false, run: true, reporters: [], ...profile.options },
          profile.overrides ? mergeConfig(config, profile.overrides) : config,
        )
        result = await context.start()
      } catch (err) {
        rejected = true
        rejection = err
      } finally {
        try {
          await context?.close()
        } catch (err) {
          closeErrors.push(err)
        }
      }
      if (closeErrors.length) {
        const errors = [...(rejected ? [rejection] : []), ...closeErrors]
        throw new AggregateError(errors, 'Profile context close failed', { cause: errors[0] })
      }
      const row = {
        profile: profile.name,
        body: await exists(join(root, 'body.marker')),
        setupImport: await exists(join(root, 'setup-import.marker')),
        setupCall: await exists(join(root, 'setup-call.marker')),
        rejected,
      }
      for (const field of ['body', 'setupImport', 'setupCall'] as const) {
        assert.equal(row[field], profile.admitted, JSON.stringify(row))
      }
      assert.equal(rejected, !profile.admitted, String(rejection))
      if (profile.admitted) {
        assert.equal(result?.testModules.length, 1)
        assert.equal(result?.testModules[0]?.ok(), true)
        assert.equal(result?.unhandledErrors.length, 0)
      } else {
        assert.match(String(rejection), /effective (testTimeout|hookTimeout) must be/)
      }
      rows.push(row)
    }
  } catch (err) {
    failed = true
    primary = err
  } finally {
    try {
      await rm(scratch, { recursive: true, force: true })
    } catch (err) {
      cleanup.push(err)
    }
  }
  if (failed || cleanup.length) {
    const errors = [...(failed ? [primary] : []), ...cleanup]
    throw new AggregateError(errors, 'Finite timeout admission failed', { cause: errors[0] })
  }
  return rows
}
