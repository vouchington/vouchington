import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { ALLOWED_LABELS } from './runner-policy-classify.mts'

// The runner allowlist owns the versioned ARM label; read it instead of pinning a second literal.
const armLabel = ALLOWED_LABELS.find(label => label.endsWith('-arm'))

type Job = {
  if?: string
  'runs-on'?: string | string[]
  'timeout-minutes'?: number
  permissions?: Record<string, string>
  services?: Record<string, { image?: string; ports?: number[]; options?: string }>
  steps?: Array<{
    name?: string
    run?: string
    uses?: string
    'timeout-minutes'?: number
    with?: Record<string, number | string>
  }>
}

type Workflow = {
  permissions?: Record<string, string>
  jobs?: Record<string, Job>
}

const workflow = readFileSync('.github/workflows/checks-static.yml', 'utf8')
const parsed = load(workflow) as Workflow

function jobSection(jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number`)
  }

  return value
}

function serialCriticalStepBudget(jobName: string): number {
  const job = parsed.jobs?.[jobName]
  if (!job) {
    throw new TypeError(`${jobName} must exist`)
  }

  return (
    job.steps?.reduce((total, step) => {
      const stepTimeout = typeof step['timeout-minutes'] === 'number' ? step['timeout-minutes'] : 0
      if (!step.uses?.startsWith('nick-fields/retry@')) {
        return total + stepTimeout
      }

      const perAttempt = numberField(step.with?.timeout_minutes, `${jobName} retry timeout`)
      const attempts = numberField(step.with?.max_attempts, `${jobName} retry attempts`)
      return total + stepTimeout + perAttempt * attempts
    }, 0) ?? 0
  )
}

describe('checks-static workflow', () => {
  it('defaults to read-only workflow permissions', () => {
    expect(parsed.permissions).toEqual({ contents: 'read' })
  })

  it('gates each static-* job on its own area input', () => {
    expect(parsed.jobs?.['static-backend']?.if).toBe('inputs.backend')
    expect(parsed.jobs?.['static-web']?.if).toBe('inputs.web')
    expect(parsed.jobs?.['static-lambdas']?.if).toBe('inputs.lambdas')
    expect(parsed.jobs?.['static-cloudflare']?.if).toBe('inputs.cloudflare-worker')
  })

  it('runs the shared-build producer and the Lambda package smoke on native ARM64 and the other static-* jobs on ubuntu-latest', () => {
    expect(armLabel).toBeDefined()
    expect(parsed.jobs?.['static-web']?.['runs-on']).toEqual(armLabel)
    expect(parsed.jobs?.['static-lambdas']?.['runs-on']).toEqual(armLabel)
    for (const job of ['static-backend', 'static-cloudflare']) {
      expect(parsed.jobs?.[job]?.['runs-on']).toEqual('ubuntu-latest')
    }
  })

  it('budgets each additive job above its serial critical step timeouts', () => {
    const expectedBudgets = new Map([
      ['static-backend', 14],
      ['static-lambdas', 15],
      ['static-cloudflare', 10],
    ])

    for (const [jobName, expectedBudget] of expectedBudgets) {
      const jobBudget = numberField(parsed.jobs?.[jobName]?.['timeout-minutes'], jobName)
      expect(jobBudget).toBe(expectedBudget)
      expect(jobBudget).toBeGreaterThan(serialCriticalStepBudget(jobName))
    }
  })

  it('gives the static-web gate a fail-fast budget between its largest step and the step sum', () => {
    const jobBudget = numberField(parsed.jobs?.['static-web']?.['timeout-minutes'], 'static-web')
    const stepTimeouts = (parsed.jobs?.['static-web']?.steps ?? []).map(step =>
      typeof step['timeout-minutes'] === 'number' ? step['timeout-minutes'] : 0,
    )

    expect(jobBudget).toBe(10)
    // Provisioning headroom above the largest single step, but no reserve for every step
    // degrading to its own ceiling in one run.
    expect(jobBudget).toBeGreaterThan(Math.max(...stepTimeouts))
    expect(jobBudget).toBeLessThan(serialCriticalStepBudget('static-web'))
  })

  it('uses setup-backend on the static backend job', () => {
    const job = jobSection('static-backend')
    expect(job).toContain('- uses: ./.github/actions/setup-backend')
  })

  it('owns the backend dependency and fixture checks', () => {
    const job = jobSection('static-backend')
    expect(job).toContain(
      'pnpm exec depcruise --config backend/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content backend',
    )
    expect(job).not.toContain('Typecheck backend and email templates')
  })

  it('checks PostgreSQL contracts, explicit fixtures, and the live MCP catalog', () => {
    const job = jobSection('static-backend')
    const steps = parsed.jobs?.['static-backend']?.steps ?? []
    const compilation = steps.find(
      step => step.name === 'Check PostgreSQL contracts, API fixtures, and MCP catalog',
    )
    const apiFixtureSnapshots = steps.find(
      step => step.name === 'Check canonical API snapshot git state',
    )
    expect(
      compilation?.run?.startsWith(
        'pnpm run backend-row-contracts:check\npnpm run api-fixtures:check\nexport NODE_ENV=test\n',
      ),
    ).toBe(true)
    expect(compilation?.run).toContain(
      "export VALKEY_URL=redis://localhost:${{ job.services.valkey.ports['6379'] }}",
    )
    expect(compilation?.run?.trim().split('\n').slice(-2)).toEqual([
      'node ci/check-live-mcp-catalog.mjs',
      'pnpm run mcp:catalog -- --check',
    ])
    expect(numberField(compilation?.['timeout-minutes'], 'contract check')).toBeGreaterThan(
      numberField(apiFixtureSnapshots?.['timeout-minutes'], 'snapshot Git guard'),
    )
    expect(
      steps.filter(step => step.run?.includes('pnpm run backend-row-contracts:check')),
    ).toHaveLength(1)
    expect(apiFixtureSnapshots).toMatchObject({
      run: `git diff --exit-code -- api-fixtures/v1/manifest.json api-fixtures/v1/schema-lock.json api-fixtures/v1/responses api-fixtures/v1/request-contracts.json
untracked_generated_files="$(git ls-files --others --exclude-standard -- api-fixtures/v1/manifest.json api-fixtures/v1/schema-lock.json api-fixtures/v1/responses api-fixtures/v1/request-contracts.json)"
if [ -n "$untracked_generated_files" ]; then
  echo "::error::Generated API fixture files are untracked:"
  printf '%s\\n' "$untracked_generated_files"
  exit 1
fi\n`,
    })
    const valkey = parsed.jobs?.['static-backend']?.services?.valkey
    expect(valkey?.image).toMatch(/^valkey\/valkey-bundle:[^@]+@sha256:[a-f0-9]{64}$/)
    expect(valkey?.ports).toEqual([6379])
    expect(valkey?.options).toContain('--health-cmd "valkey-cli ping"')
    expect(parsed.jobs?.['static-backend']?.services?.postgres).toBeUndefined()
    for (const name of [
      'S3_BUCKET_IMAGES',
      'S3_BUCKET_IMAGE_UPLOADS',
      'S3_BUCKET_SITEMAPS',
      'S3_BUCKET_RENDERS',
      'S3_BUCKET_ASSETS',
      'S3_BUCKET_CRAWLS',
      'S3_BUCKET_USER_EXPORTS',
      'S3_BUCKET_QUARANTINE',
    ]) {
      expect(compilation?.run).toContain(`export ${name}=test-`)
    }
    expect(steps.filter(step => step.run?.includes('check-live-mcp-catalog.mjs'))).toHaveLength(1)
    expect(
      steps.filter(step => step.run?.includes('pnpm run mcp:catalog -- --check')),
    ).toHaveLength(1)
    expect(apiFixtureSnapshots?.run).not.toContain('pnpm')
    expect(apiFixtureSnapshots?.run).not.toContain('vitest')
    expect(apiFixtureSnapshots?.run).not.toContain('api-fixtures:generate')
    expect(apiFixtureSnapshots?.run).not.toContain('openapi:generate')
    expect(
      job.indexOf('- name: Check PostgreSQL contracts, API fixtures, and MCP catalog'),
    ).toBeGreaterThan(job.indexOf('- name: Check backend dependencies'))
    expect(steps.indexOf(apiFixtureSnapshots!)).toBeGreaterThan(steps.indexOf(compilation!))
  })

  it('owns the web pages-router, dependency, build, and smoke checks lifted from tests-web.yml', () => {
    const job = jobSection('static-web')
    expect(job).toContain('Pages Router directory found')
    expect(job).toContain(
      'pnpm exec depcruise --config web/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content web',
    )
    expect(job).not.toContain('Typecheck web')
    expect(job).not.toContain('VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT')
    expect(job).not.toContain('VOUCHA_BUILD_LOCK_WAIT_SECONDS')
    expect(job).toContain('./web/scripts/tests/smoke-test-web.sh')
  })

  it('builds through the shared build-web-targets composite instead of a standalone `next build` (#10990)', () => {
    const job = jobSection('static-web')
    expect(job).toContain('uses: ./.github/actions/build-web-targets')
    expect(job).toContain('artifact-suffix: static-web')
    // build-web-targets-timeouts.test.mts sizes this step's timeout-minutes from the composite's
    // build deadline for every caller; restating the value here would duplicate it.
  })

  it('produces the shared build with the composite production profile', () => {
    const job = jobSection('static-web')
    expect(job).toContain('shared-build-cache-mode: producer')
    expect(job).not.toContain('NEXT_TEST_BUILD=0')
    expect(job).toContain('IMAGE_ORIGIN: http://localhost:3100')
  })

  it('owns the lambdas dependency and smoke checks', () => {
    const job = jobSection('static-lambdas')
    expect(job).toContain(
      'pnpm exec depcruise --config lambdas/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content lambdas',
    )
    expect(job).not.toContain('Typecheck lambdas')
    const build = job.indexOf('run: pnpm --filter @lambdas/image-resize run build')
    expect(build).toBeGreaterThan(0)
    expect(
      job.indexOf('run: pnpm --filter @lambdas/image-resize run test:smoke:package'),
    ).toBeGreaterThan(build)
  })

  it('does not duplicate compiler gates owned by unconditional static analysis', () => {
    expect(workflow).not.toMatch(/- name: Typecheck /)
    expect(workflow).not.toContain('pnpm exec tsc --noEmit')
    expect(workflow).not.toContain('pnpm exec next typegen')
  })

  it('owns the Cloudflare Worker smoke and dry-run deploy checks lifted from tests-cloudflare-worker.yml', () => {
    const job = jobSection('static-cloudflare')
    expect(job).not.toContain('Typecheck Cloudflare Worker')
    expect(job).toContain('./scripts/tests/smoke-test-cloudflare-worker.sh')
    expect(job).toContain(
      'CSP_BROWSER_UPLOAD_ORIGINS=["https://test-images.s3.us-west-2.amazonaws.com","https://test-images.s3.dualstack.us-west-2.amazonaws.com"]',
    )
    expect(job).toContain('pnpm exec wrangler deploy --config wrangler.local.jsonc --dry-run')
    expect(job).not.toContain('--env staging')
  })
})
