import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
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

describe('build-web-targets composite action', () => {
  it('builds Next.js standalone and Cloudflare Worker targets', () => {
    expect(action).toContain('node ci/setup-web-integration.mts')
    expect(action).not.toContain('with-build-lock.sh')
    // #3452 removed a shared-artifact producer/restore path for the BUILD OUTPUT
    // (web/.next/standalone, cloudflare-worker/dist) because the large artifact could not
    // reliably download within the restore step's timeout. `artifact-suffix` below is unrelated:
    // it disambiguates the tiny per-shard timings JSON, not a rebuilt-output artifact, so this
    // guard only pins the old input/action names rather than banning `inputs:` outright.
    expect(action).not.toContain('artifact-name')
    expect(action).not.toContain('restore-web-targets')
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

  it('captures a per-job web build timing report for issue #10937 (host-lock instrumentation)', () => {
    const buildStep = step('Build web targets')
    expect(buildStep.env?.FILAMENTS_SETUP_WEB_TIMINGS_JSON).toBe(
      '${{ runner.temp }}/web-build-timings.json',
    )
    expect(buildStep.env?.VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS).toBeUndefined()
    const buildRun = buildStep.run ?? ''
    expect(buildRun).toContain('if [ -f .env ]; then set -a; source .env; set +a; fi')
    expect(buildRun).toContain(
      'VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS=360 node ci/setup-web-integration.mts',
    )
    expect(buildRun.indexOf('source .env')).toBeLessThan(
      buildRun.indexOf('VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS=360'),
    )

    const summaryStep = step('Summarize web build timings')
    expect(summaryStep.if).toBe('always()')
    // Delegates rendering to ci/write-web-build-timings-summary.mts rather than a raw `cat` into a
    // JSON fence, so the host pressure snapshot's multi-line text isn't JSON-escaped onto one
    // unreadable line -- see write-web-build-timings-summary.test.mts.
    expect(summaryStep.run).toContain('node ci/write-web-build-timings-summary.mts')
    expect(summaryStep.run).toContain('${{ runner.temp }}/web-build-timings.json')
  })

  it('uploads the timing report on success and failure alike, tolerating a missing file', () => {
    const uploadStep = step('Upload web build timings')
    expect(uploadStep.if).toBe('always()')
    // Telemetry, not correctness evidence: a slow or unavailable artifact service must not turn a
    // successful build red.
    expect(uploadStep['continue-on-error']).toBe(true)
    // Shape assertion, not an exact pin -- see .github/workflows/workflow-action-pinning.test.mts
    // and the identical pattern in .github/workflows/ci-record-state.test.mts.
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
