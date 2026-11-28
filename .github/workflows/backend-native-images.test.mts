import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { primaryPathFilters } from '../test-helpers/path-filter-test-fixtures.mts'
import picomatch from 'picomatch'

type Job = {
  permissions?: Record<string, string>
  services?: unknown
  steps?: { uses?: string; run?: string; with?: Record<string, unknown> }[]
}
const smoke = parse(readFileSync('.github/workflows/checks-backend-smoke.yml', 'utf8')) as {
  jobs: Record<string, Job>
}

describe('backend native image validation', () => {
  it('validates native images without credentials, services or publication', () => {
    const native = smoke.jobs['native-images']!
    expect(native.permissions).toEqual({ contents: 'read' })
    expect(native.services).toBeUndefined()
    expect(JSON.stringify(native)).not.toMatch(
      /secrets\.|id-token|setup-aws|trusted.secret.context|publish-images/,
    )
    expect(
      native.steps?.find(step => step.uses?.startsWith('actions/checkout@'))?.with?.[
        'persist-credentials'
      ],
    ).toBe(false)
    const build = native.steps?.find(step => step.run?.includes('docker buildx bake'))?.run
    expect(build).toBeDefined()
    expect(build).not.toContain('--push')
  })

  it.each([
    'pnpm-lock.yaml',
    'backend/data-stores/analytics/package.json',
    'backend/modules/utils/duckdb-image-smoke.mts',
    'backend/modules/utils/image-smoke.mts',
    'backend/entrypoints/api/executable.mts',
    'backend/entrypoints/worker-cpu/executable.mts',
    'backend/entrypoints/worker-io/executable.mts',
    'backend/scripts/build/compile-backend-binaries.mts',
    'backend/scripts/build/compile-runtime-files.mts',
  ])('selects credential-free image validation for %s', path => {
    expect(
      primaryPathFilters['build-backend-infra']?.some(glob =>
        picomatch.isMatch(path, glob, { dot: true }),
      ),
    ).toBe(true)
  })

  it.each([
    { fail: false, status: 0, targets: ['api', 'worker-cpu', 'worker-io'] },
    { fail: true, status: 7, targets: ['api', 'worker-cpu'] },
  ])(
    'runs shipping entrypoints offline and propagates query failure=%s',
    ({ fail, status, targets }) => {
      const root = mkdtempSync(join(tmpdir(), 'native-image-probe-'))
      const calls = join(root, 'calls')
      writeFileSync(
        join(root, 'docker'),
        `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
if [[ "$1" == run && "$*" == *voucha-native/worker-cpu:smoke* && "$FAIL_PROBE" == true ]]; then exit 7; fi
`,
        { mode: 0o755 },
      )
      try {
        const result = spawnSync('bash', ['.github/workflows/checks-backend-native-images.sh'], {
          env: {
            ...process.env,
            PATH: `${root}:${process.env.PATH}`,
            DOCKER_CALLS: calls,
            FAIL_PROBE: String(fail),
          },
        })
        expect(result.status).toBe(status)
        const invocations = readFileSync(calls, 'utf8').trim().split('\n')
        const probes = invocations.filter(line => line.startsWith('run '))
        expect(probes.map(line => line.replace(/--name \S+ /, ''))).toEqual(
          targets.map(
            target =>
              `run --rm --network none voucha-native/${target}:smoke image-smoke.mts${target === 'worker-io' ? ' io' : ''}`,
          ),
        )
        expect(invocations.filter(line => line.startsWith('rm -f '))).toHaveLength(3)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
