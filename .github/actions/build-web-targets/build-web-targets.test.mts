import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  id?: string
  name?: string
  shell?: string
  if?: string
  'continue-on-error'?: boolean
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, boolean | number | string>
}

type CompositeAction = {
  inputs?: Record<string, { required?: boolean; default?: string; description?: string }>
  runs?: {
    using?: string
    steps?: Step[]
  }
}

const action = readFileSync('.github/actions/build-web-targets/action.yml', 'utf8')
const parsed = load(action) as CompositeAction

function step(name: string): Step {
  const found = parsed.runs?.steps?.find(candidate => candidate.name === name)
  if (!found) throw new TypeError(`step not found: ${name}`)
  return found
}

function cachePaths(candidate: Step): string[] {
  const paths = candidate.with?.path
  if (typeof paths !== 'string') throw new TypeError('cache path must be a string')
  return paths
    .split('\n')
    .map(path => path.trim())
    .filter(Boolean)
}

describe('build-web-targets composite action', () => {
  it('builds Next.js standalone and Cloudflare Worker targets', () => {
    expect(action).toContain('node ci/setup-web-integration.mts')
    expect(action).not.toContain('with-build-lock.sh')
    // Timing artifacts remain independent of the run-scoped runtime cache: the suffix avoids
    // matrix timing-artifact collisions and is not part of the cache key.
    expect(action).not.toContain('artifact-name')
  })

  it('accepts an artifact-suffix input so matrix callers avoid a shared artifact name', () => {
    expect(parsed).toEqual(
      expect.objectContaining({
        inputs: {
          'artifact-suffix': expect.objectContaining({
            required: false,
            default: 'generic',
          }),
          'web-build-fs-cache-enabled': expect.objectContaining({
            required: false,
            default: 'false',
          }),
          'shared-build-cache-mode': expect.objectContaining({
            required: true,
          }),
        },
      }),
    )
  })

  it('forwards web-build-fs-cache-enabled into the build step env, off by default', () => {
    const buildStep = step('Build web targets')
    expect(buildStep.env?.WEB_BUILD_FS_CACHE_ENABLED).toBe(
      '${{ inputs.web-build-fs-cache-enabled }}',
    )
    expect(parsed.inputs?.['web-build-fs-cache-enabled']?.default).toBe('false')
  })

  it('restores only a complete run-scoped runtime build and rebuilds on a cache failure', () => {
    const validateMode = step('Validate shared build cache mode')
    expect(validateMode.run).toContain('producer|consumer')

    const clearStep = step('Clear shared web build runtime paths')
    expect(clearStep.if).toBe("${{ inputs.shared-build-cache-mode == 'consumer' }}")
    expect(clearStep.run).toContain('web/.next/standalone')
    expect(clearStep.run).toContain('web/.next/static')
    expect(clearStep.run).toContain('cloudflare-worker/dist')

    const restoreStep = step('Restore shared web build runtime paths')
    expect(restoreStep.id).toBe('restore-web-targets')
    expect(restoreStep.if).toBe("${{ inputs.shared-build-cache-mode == 'consumer' }}")
    expect(restoreStep['continue-on-error']).toBe(true)
    expect(restoreStep.uses?.startsWith('actions/cache/restore@')).toBe(true)
    expect(restoreStep.uses?.slice('actions/cache/restore@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(cachePaths(restoreStep)).toEqual([
      'web/.next/standalone',
      'web/.next/static',
      'cloudflare-worker/dist',
    ])
    expect(restoreStep.with?.key).toBe(
      '${{ runner.os }}-${{ runner.arch }}-web-build-targets-ci-production-worker-assets-v1-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}',
    )

    const validateRestoredStep = step('Validate restored web build runtime paths')
    expect(validateRestoredStep.id).toBe('validate-restored-web-targets')
    expect(validateRestoredStep.run).toContain('steps.restore-web-targets.outputs.cache-hit')
    expect(validateRestoredStep.run).toContain('node ci/web-build-cache-manifest.mts verify')

    const buildStep = step('Build web targets')
    expect(buildStep.if).toBe(
      "${{ inputs.shared-build-cache-mode == 'producer' || steps.validate-restored-web-targets.outputs.complete != 'true' }}",
    )
  })

  it('uses one canonical shared-cache build profile and saves producer output without making cache availability a gate', () => {
    const buildStep = step('Build web targets')
    const buildRun = buildStep.run ?? ''
    expect(buildRun).toContain('export NEXT_TEST_BUILD=0')
    expect(buildRun).toContain("export NEXT_PUBLIC_ASSET_PREFIX=''")
    expect(buildRun.indexOf('source .env')).toBeLessThan(
      buildRun.indexOf('export NEXT_TEST_BUILD=0'),
    )
    expect(buildRun.indexOf('export NEXT_TEST_BUILD=0')).toBeLessThan(
      buildRun.indexOf('node ci/setup-web-integration.mts'),
    )

    const saveStep = step('Save shared web build runtime paths')
    const stampStep = step('Stamp shared web build manifest')
    expect(stampStep.run).toBe('node ci/web-build-cache-manifest.mts write')
    expect(stampStep.if).toBe("${{ inputs.shared-build-cache-mode == 'producer' && success() }}")
    expect(saveStep.if).toBe("${{ inputs.shared-build-cache-mode == 'producer' && success() }}")
    expect(saveStep['continue-on-error']).toBe(true)
    expect(saveStep.uses?.startsWith('actions/cache/save@')).toBe(true)
    expect(saveStep.uses?.slice('actions/cache/save@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(cachePaths(saveStep)).toEqual([
      'web/.next/standalone',
      'web/.next/static',
      'cloudflare-worker/dist',
    ])
    expect(saveStep.with?.key).toBe(
      '${{ runner.os }}-${{ runner.arch }}-web-build-targets-ci-production-worker-assets-v1-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}',
    )
  })

  it('captures a per-job web build timing report for issue #10937', () => {
    const buildStep = step('Build web targets')
    expect(buildStep.env?.VOUCHINGTON_SETUP_WEB_TIMINGS_JSON).toBe(
      '${{ runner.temp }}/web-build-timings.json',
    )
    const buildRun = buildStep.run ?? ''
    expect(buildRun).toContain('if [ -f .env ]; then set -a; source .env; set +a; fi')
    expect(buildRun).toContain('node ci/setup-web-integration.mts')
    expect(buildRun.indexOf('source .env')).toBeLessThan(
      buildRun.indexOf('node ci/setup-web-integration.mts'),
    )

    const summaryStep = step('Summarize web build timings')
    expect(summaryStep.if).toBe('always()')
    // Delegates rendering to ci/write-web-build-timings-summary.mts rather than a raw `cat` into a
    // JSON fence, for readability -- see write-web-build-timings-summary.test.mts.
    expect(summaryStep.run).toContain('node ci/write-web-build-timings-summary.mts')
    expect(summaryStep.run).toContain('${{ runner.temp }}/web-build-timings.json')
  })

  it('uploads the timing report on success and failure alike, tolerating a missing file', () => {
    const uploadStep = step('Upload web build timings')
    expect(uploadStep.if).toBe('always()')
    // Telemetry, not correctness evidence: a slow or unavailable artifact service must not turn a
    // successful build red.
    expect(uploadStep['continue-on-error']).toBe(true)
    // Shape assertion, not an exact pin -- see .github/workflows/workflow-action-pinning.test.mts.
    expect(uploadStep.uses?.startsWith('actions/upload-artifact@')).toBe(true)
    expect(uploadStep.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)

    // artifact-suffix disambiguates concurrent matrix shards (github.job alone is identical across
    // shards of the same job; composite actions cannot read matrix.* directly) -- see the
    // "accepts an artifact-suffix input" case above.
    expect(uploadStep.with).toEqual({
      name: 'web-build-timings-${{ github.job }}-${{ inputs.artifact-suffix }}-${{ github.run_id }}-${{ github.run_attempt }}',
      path: '${{ runner.temp }}/web-build-timings.json',
      'if-no-files-found': 'warn',
      overwrite: true,
      'retention-days': 1,
    })
  })
})
