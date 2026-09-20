import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FETCH_FORBIDDEN_PORTS } from '@ts-shared/utils/fetch-ports'

// PW_FILES selection-decode behavior (runPlaywrightPnpmArgs et al.) lives in the
// co-located tests-playwright.part-2.test.mts, split out to stay under the oxlint max-lines cap.
const workflow = readFileSync('.github/workflows/tests-playwright.yml', 'utf8')
const playwrightConfigHelpers = readFileSync('playwright/config/config-helpers.mts', 'utf8')
const playwrightSharedConfig = readFileSync('playwright/config/shared-config.mts', 'utf8')
const browserSafePortsScript = readFileSync('ci/allocate-browser-safe-ports.py', 'utf8')

function workflowJobSection(body: string, jobName: string): string {
  const match = body.match(
    new RegExp(`\\n {2}${jobName}:[\\s\\S]*?(?=\\n {2}[a-zA-Z0-9_-]+:\\n|$)`),
  )
  expect(match).not.toBeNull()
  return match![0]
}

describe('tests-playwright.yml', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('runs the selector and Playwright shards on ubuntu-latest', () => {
    expect(workflowJobSection(workflow, 'select')).toContain('runs-on: ubuntu-latest\n')
    expect(workflowJobSection(workflow, 'playwright-tests')).toContain('runs-on: ubuntu-latest')
  })

  it('accepts an optional shard-total override and transports it to the selector', () => {
    expect(workflow).toContain(`shard_total_override:
        description: Override the computed Playwright shard total
        type: string
        required: false
        default: ''`)
    expect(workflow).toContain(
      'SHARD_TOTAL_OVERRIDE: ${{ inputs.shard_total_override || vars.PLAYWRIGHT_SHARD_TOTAL }}',
    )
    expect(workflow).not.toContain('PLAYWRIGHT_FILES_PER_SHARD')
    expect(workflow).not.toContain('PLAYWRIGHT_TEST_SHARDS')
  })

  it('rejects shard totals outside the GitHub matrix range', () => {
    const shardMatrixStep = workflow.match(
      /- name: Build shard matrix[\s\S]*?(?=\n {6}- name:|\n {2}[a-zA-Z0-9_-]+:\n|$)/,
    )

    expect(shardMatrixStep).not.toBeNull()
    expect(shardMatrixStep![0]).toContain('^([1-9][0-9]{0,2})$')
    expect(shardMatrixStep![0]).toContain('[ "$total" -gt 256 ]')
    expect(shardMatrixStep![0]).toContain('shard-total must be an integer from 1 through 256')
  })

  it('keeps PR calls dynamic and preserves the shard execution contract', () => {
    const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8')
    const prCall = workflowJobSection(ciWorkflow, 'test-playwright')
    const shardJob = workflowJobSection(workflow, 'playwright-tests')

    expect(prCall).toContain('uses: ./.github/workflows/tests-playwright.yml')
    expect(prCall).not.toContain('shard_total_override:')
    expect(shardJob).toContain('uses: ./.github/actions/build-web-targets')
    expect(shardJob).toContain("PLAYWRIGHT_MAX_WORKERS: '3'")
    expect(shardJob).toContain('OTEL_ENABLED:')
    expect(shardJob).toContain('PW_FILES: ${{ needs.select.outputs.files }}')
    expect(shardJob).toContain('playwright test "${FILES[@]}" "$SHARD_ARG"')
    expect(workflow).toContain('needs.select.outputs.shard-matrix')
  })

  it('serializes Playwright workflow runs without serializing matrix shards', () => {
    const shardJobMatch = workflow.match(
      /\n {2}playwright-tests:[\s\S]*?(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/,
    )

    expect(shardJobMatch).not.toBeNull()
    expect(workflow).toContain(
      'group: playwright-tests-${{ github.event.pull_request.number || github.ref || github.sha }}',
    )
    expect(workflow).toContain("cancel-in-progress: ${{ inputs.event-name == 'pull_request' }}")
    expect(shardJobMatch![0]).not.toContain('\n    concurrency:')
  })

  it('builds web targets in each shard instead of restoring a shared artifact', () => {
    expect(workflow).not.toContain('web-targets-artifact-name')
    expect(workflow).not.toContain('restore-web-targets')
    expect(workflow).not.toMatch(/\n {2}build-web-targets:\n/)
    expect(workflow).toContain('uses: ./.github/actions/build-web-targets')
  })

  it('exports IMAGE_ORIGIN from the allocated image lambda port', () => {
    const jobEnvironment = workflow.indexOf("PLAYWRIGHT_MAX_WORKERS: '3'")
    const imageOrigin = workflow.indexOf(
      'echo "IMAGE_ORIGIN=http://localhost:$IMAGE_LAMBDA_PORT" >> "$GITHUB_ENV"',
    )

    expect(workflow).toContain(
      'echo "IMAGE_ORIGIN=http://localhost:$IMAGE_LAMBDA_PORT" >> "$GITHUB_ENV"',
    )
    expect(imageOrigin).toBeGreaterThan(jobEnvironment)
  })

  it('lets Wrangler allocate the inspector port in CI', () => {
    expect(workflow).not.toContain('INSPECTOR_PORT')
    expect(workflow).toContain('python3 ci/allocate-browser-safe-ports.py 6')
    expect(playwrightSharedConfig).toContain('node cloudflare-worker/scripts/wrangler/start.mts')
  })

  it('supplies synthetic browser-upload origins to the uncredentialed Worker', () => {
    expect(workflow).toContain(
      'CSP_BROWSER_UPLOAD_ORIGINS=["https://test-images.s3.us-west-2.amazonaws.com","https://test-images.s3.dualstack.us-west-2.amazonaws.com"]',
    )
  })

  it('uses a fixed logical asset origin so web builds remain independent of shard ports', () => {
    const shardJob = workflowJobSection(workflow, 'playwright-tests')

    expect(shardJob).toMatch(/NEXT_PUBLIC_ASSET_PREFIX: http:\/\/localhost(\s|$)/)
    expect(shardJob).toMatch(/echo "CSP_ASSET_ORIGIN=http:\/\/localhost"(\s|$)/)
    expect(shardJob).not.toContain('NEXT_PUBLIC_ASSET_PREFIX=http://localhost:$NEXT_PORT')
    expect(shardJob).not.toContain('CSP_ASSET_ORIGIN=http://localhost:$NEXT_PORT')
  })

  it('does not allocate Chromium-restricted ports for browser-facing servers', () => {
    expect(workflow).toContain('python3 ci/allocate-browser-safe-ports.py 6')
    expect(browserSafePortsScript).toContain('packaged.with_name("fetch-forbidden-ports.json")')
    expect(browserSafePortsScript).not.toContain('--forbidden-ports')
    expect(FETCH_FORBIDDEN_PORTS).toEqual(expect.arrayContaining([4045, 6667, 10_080]))
  })

  it('installs JavaScript dependencies before allocating ports', () => {
    const activate = workflow.indexOf('- name: Activate pnpm via corepack')
    const install = workflow.indexOf('- name: pnpm install')
    const allocate = workflow.indexOf('- name: Allocate ports')
    expect(activate).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(activate)
    expect(allocate).toBeGreaterThan(install)
    const installStep = workflow.slice(install, allocate)
    expect(installStep).toContain('ci/pnpm-install.sh')
    expect(installStep).toContain('--runner-lifecycle ephemeral-full')
    expect(installStep).toContain('--command-timeout-seconds 0')
  })

  it('holds Playwright ports until each consumer binds', () => {
    const allocationStep = workflow.slice(
      workflow.indexOf('- name: Allocate ports'),
      workflow.indexOf('- name: Start OTel collector'),
    )
    const confirmStep = workflow.slice(
      workflow.indexOf('- name: Confirm port holder'),
      workflow.indexOf('- name: Set image origin'),
    )

    expect(
      allocationStep.match(/python3 ci\/allocate-browser-safe-ports\.py 6 --hold/g),
    ).toHaveLength(1)
    expect(allocationStep).toContain('PORT_HOLD_DIR=$HOLD_DIR')
    expect(allocationStep).toContain('--check --hold-dir "$HOLD_DIR"')
    expect(allocationStep).not.toContain('lsof -ti:"$p"')
    expect(allocationStep).not.toContain('deterministic allocation will not retry')
    expect(allocationStep).not.toContain('re-randomizing')
    expect(confirmStep).toContain('--check --hold-dir "$PORT_HOLD_DIR"')
    expect(workflow).toContain('name: Stop port holder')
    expect(workflow).toContain('if: ${{ always() }}')
    expect(playwrightSharedConfig).toContain('withHeldPortRelease(')
    expect(readFileSync('playwright/config/web-server-command.mts', 'utf8')).toContain(
      'allocate-browser-safe-ports.py',
    )
  })

  it('does not upload Playwright HTML report artifacts', () => {
    expect(workflow).not.toContain('playwright-report')
    expect(readFileSync('playwright/config/web-server-command.mts', 'utf8')).toContain(
      "return ci\n    ? [\n        ['github'],",
    )
    expect(readFileSync('playwright/config/web-server-command.mts', 'utf8')).toContain(
      ": [['html', { open: 'never' }]]",
    )
  })

  it('uploads the selected no-mistakes Playwright plan for PR diagnostics', () => {
    const uploadIndex = workflow.indexOf('name: Upload Playwright test plan')
    const matrixIndex = workflow.indexOf('name: Build shard matrix')

    expect(workflow).toContain('name: Upload Playwright test plan')
    expect(workflow).toContain('name: playwright-test-plan')
    expect(workflow).toContain('playwright-test-plan.json')
    expect(workflow).toContain('playwright-test-plan.md')
    expect(workflow).toContain('if-no-files-found: ignore')
    expect(workflow).toContain('retention-days: 1')
    expect(uploadIndex).toBeGreaterThan(matrixIndex)
    expect(workflow.slice(uploadIndex, uploadIndex + 200)).toContain('if: ${{ !cancelled() }}')
  })

  it('delegates Playwright browser caching and does not cache Next.js builds', () => {
    expect(workflow).toContain('uses: ./.github/actions/setup-playwright')
    expect(workflow).not.toContain('name: Cache Playwright browsers')
    expect(workflow).not.toMatch(/path:\s*\n\s+~\/.cache\/ms-playwright/)
    // The shared Playwright setup owns browser caching. This workflow does not
    // independently cache either the browsers or Next.js build output.
    expect(workflow).not.toContain('Restore Next.js build cache')
    expect(workflow).not.toContain('Save Next.js build cache')
    expect(workflow).not.toContain('next-build-cache-v4')
  })

  it('preserves quoted NODE_OPTIONS entries when adding server flags', () => {
    expect(playwrightConfigHelpers).toContain('new RegExp')
    expect(playwrightConfigHelpers).not.toContain('split(/\\s+/)')
  })

  it('fails fast-ish in CI after a few Playwright failures', () => {
    expect(playwrightSharedConfig).toContain('maxFailures: CI ? 3 : undefined')
  })

  it('defaults Playwright to three workers in CI', async () => {
    vi.stubEnv('CI', 'true')
    vi.stubEnv('PLAYWRIGHT_MAX_WORKERS', '')
    vi.resetModules()
    const { CHROMIUM_USE, createPlaywrightConfig } =
      await import('../../playwright/config/shared-config.mts')

    const config = createPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 60_000,
    })

    expect(config.workers).toBe(3)
  })
})
