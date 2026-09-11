import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = {
  if?: string
  'runs-on'?: string | string[]
  'timeout-minutes'?: number
  permissions?: Record<string, string>
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

  it('runs the bare-[self-hosted] static-* jobs on bare [self-hosted]', () => {
    for (const job of ['static-backend', 'static-lambdas', 'static-cloudflare']) {
      expect(parsed.jobs?.[job]?.['runs-on']).toEqual(['self-hosted'])
    }
  })

  it('pins static-web to Linux since it shares the build-web-targets artifact-shape contract (#10990)', () => {
    expect(parsed.jobs?.['static-web']?.['runs-on']).toEqual(['self-hosted', 'Linux'])
  })

  it('budgets each job above its serial critical step timeouts', () => {
    const expectedBudgets = new Map([
      ['static-backend', 15],
      ['static-web', 35],
      ['static-lambdas', 18],
      ['static-cloudflare', 20],
    ])

    for (const [jobName, expectedBudget] of expectedBudgets) {
      const jobBudget = numberField(parsed.jobs?.[jobName]?.['timeout-minutes'], jobName)
      expect(jobBudget).toBe(expectedBudget)
      expect(jobBudget).toBeGreaterThan(serialCriticalStepBudget(jobName))
    }
  })

  it('uses the persistent full install on the self-hosted static backend job', () => {
    const job = jobSection('static-backend')
    expect(job).toContain('- uses: ./.github/actions/setup-backend')
    expect(job).toContain('runner-lifecycle: persistent')
  })

  it('owns the backend dependency and TypeScript checks lifted from tests-backend-modules.yml', () => {
    const job = jobSection('static-backend')
    expect(job).toContain(
      'pnpm exec depcruise --config backend/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content backend',
    )
    expect(job).toContain(
      'pnpm exec tsc --noEmit --incremental --project backend/tsconfig.json && pnpm exec tsc --noEmit --project email-templates/tsconfig.json',
    )
  })

  it('regenerates API fixture snapshots and rejects tracked or untracked drift', () => {
    const job = jobSection('static-backend')
    const apiFixtureSnapshots = parsed.jobs?.['static-backend']?.steps?.find(
      step => step.name === 'Check API fixture snapshots are up to date',
    )

    expect(apiFixtureSnapshots).toMatchObject({
      run: `pnpm run api-fixtures:generate
git diff --exit-code -- api-fixtures/v1/manifest.json api-fixtures/v1/schema-lock.json api-fixtures/v1/responses
untracked_generated_files="$(git ls-files --others --exclude-standard -- api-fixtures/v1/manifest.json api-fixtures/v1/schema-lock.json api-fixtures/v1/responses)"
if [ -n "$untracked_generated_files" ]; then
  echo "::error::Generated API fixture files are untracked:"
  printf '%s\\n' "$untracked_generated_files"
  exit 1
fi\n`,
    })
    expect(job.indexOf('- name: Check API fixture snapshots are up to date')).toBeGreaterThan(
      job.indexOf('- name: Typecheck backend and email templates'),
    )
    expect(job.indexOf('- name: Check API fixture snapshots are up to date')).toBeGreaterThan(
      job.indexOf('- name: Check backend dependencies'),
    )
  })

  it('owns the web pages-router, dependency, typecheck, build, and smoke checks lifted from tests-web.yml', () => {
    const job = jobSection('static-web')
    expect(job).toContain('Pages Router directory found')
    expect(job).toContain(
      'pnpm exec depcruise --config web/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content web',
    )
    expect(job).toContain('pnpm exec next typegen && pnpm exec tsc --noEmit --incremental')
    expect(job).not.toContain('VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT')
    expect(job).not.toContain('VOUCHA_BUILD_LOCK_WAIT_SECONDS')
    expect(job).toContain('./web/scripts/tests/smoke-test-web.sh')
  })

  it('builds through the shared build-web-targets composite instead of a standalone `next build` (#10990)', () => {
    const job = jobSection('static-web')
    expect(job).toContain('uses: ./.github/actions/build-web-targets')
    expect(job).toContain('artifact-suffix: static-web')
    // The step's timeout-minutes value is asserted once, generically, by
    // build-lock-timeouts.test.mts's strictNextBuildJobs loop (which now covers
    // checks-static.yml#static-web) — restating the literal here would duplicate it.
  })

  it('exports the static production build profile via $GITHUB_ENV ahead of the composite invocation', () => {
    const job = jobSection('static-web')
    const configureIndex = job.indexOf('- name: Configure static production build')
    const buildTargetsIndex = job.indexOf('uses: ./.github/actions/build-web-targets')
    expect(configureIndex).toBeGreaterThan(-1)
    expect(configureIndex).toBeLessThan(buildTargetsIndex)
    expect(job).toContain('echo "IMAGE_ORIGIN=http://localhost:3100" >> "$GITHUB_ENV"')
    expect(job).toContain('echo "NEXT_TEST_BUILD=0" >> "$GITHUB_ENV"')
  })

  it('owns the lambdas dependency and TypeScript checks lifted from tests-lambdas.yml', () => {
    const job = jobSection('static-lambdas')
    expect(job).toContain(
      'pnpm exec depcruise --config lambdas/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content lambdas',
    )
    expect(job).toContain('pnpm exec tsc --noEmit --project lambdas/tsconfig.json')
  })

  it('runs each compiler gate before a fallible repository command can stop the job', () => {
    const boundaries = [
      ['static-backend', 'Typecheck backend and email templates', 'Check backend dependencies'],
      ['static-web', 'Typecheck web', 'Next.js pages-router check'],
      ['static-lambdas', 'Typecheck lambdas', 'Check lambda dependencies'],
      ['static-cloudflare', 'Typecheck Cloudflare Worker', 'Smoke test Cloudflare Worker runtime'],
    ] as const

    for (const [jobName, typecheck, laterCommand] of boundaries) {
      const job = jobSection(jobName)
      expect(job.indexOf(`- name: ${typecheck}`)).toBeGreaterThanOrEqual(0)
      expect(job.indexOf(`- name: ${typecheck}`)).toBeLessThan(
        job.indexOf(`- name: ${laterCommand}`),
      )
    }
  })

  it('owns the Cloudflare Worker typecheck, smoke, and dry-run deploy checks lifted from tests-cloudflare-worker.yml', () => {
    const job = jobSection('static-cloudflare')
    expect(job).toContain('pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json')
    expect(job).toContain('./scripts/tests/smoke-test-cloudflare-worker.sh')
    expect(job).toContain(
      'CSP_BROWSER_UPLOAD_ORIGINS=["https://test-images.s3.us-west-2.amazonaws.com","https://test-images.s3.dualstack.us-west-2.amazonaws.com"]',
    )
    expect(job).toContain('pnpm exec wrangler deploy --config wrangler.local.jsonc --dry-run')
    expect(job).not.toContain('--env staging')
  })
})
