// Consistency test: every Web/Backend area job gated on `trusted-secret-context` must only
// reference `needs.changes.outputs.<filter>` names present in the shared path filters.
// This is the exact bug class fixed in PR #4358 commit 6:
// the filter name was added to the job's if-condition but not to the detect-changes step,
// so the job never ran on path-matched PRs.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { FETCH_FORBIDDEN_PORTS } from '@ts-shared/utils/fetch-ports'

import { assertWorkflowInvariant } from '../test-helpers/workflow-fixtures.mts'

type CiWorkflow = {
  jobs?: Record<
    string,
    {
      if?: string
      needs?: string[]
    }
  >
}

const ciText = readFileSync('.github/workflows/web.yml', 'utf8')
const primaryPathFilters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
  string,
  string[]
>
const filterNames = new Set(Object.keys(primaryPathFilters))

// Find all credentialed area jobs whose condition gates on trusted-secret-context.
const trustedJobEntries = ['web', 'backend'].flatMap(area =>
  Object.entries(
    (load(readFileSync(`.github/workflows/${area}.yml`, 'utf8')) as CiWorkflow).jobs ?? {},
  )
    .filter(([, job]) => typeof job.if === 'string' && job.if.includes('trusted-secret-context'))
    .map(([jobName, job]) => [`${area}/${jobName}`, job] as const),
)
const credentialedWorkflowText = readFileSync(
  '.github/workflows/tests-playwright-credentialed.yml',
  'utf8',
)
const browserSafePortsScript = readFileSync('ci/allocate-browser-safe-ports.py', 'utf8')

// For each trusted job, extract the detect-changes output names it references, excluding
// well-known outputs that are computed by detect-changes steps instead of path filters.
const knownOutputs = new Set(['trusted-secret-context', 'dependency-bot-test-context', 'docs-only'])

function extractFilterOutputs(ifCondition: string): string[] {
  const names: string[] = []
  for (const m of ifCondition.matchAll(/needs\.changes\.outputs\.([a-z][a-z0-9-]*)/g)) {
    const name = m[1]!
    if (!knownOutputs.has(name)) names.push(name)
  }
  return names
}

describe('trusted/credentialed CI job path-filter wiring', () => {
  it('bounds the credentialed command with setup and cleanup headroom and preserves a failing status', () => {
    const workflow = load(credentialedWorkflowText) as {
      jobs: Record<
        string,
        {
          'timeout-minutes': number
          steps: Array<{ id?: string; run?: string; 'timeout-minutes'?: number }>
        }
      >
    }
    const job = workflow.jobs['playwright-credentialed-tests']!
    const step = job.steps.find(candidate => candidate.id === 'run-playwright-credentialed')!
    expect(420 + 10).toBeLessThan(step['timeout-minutes']! * 60)
    expect(step['timeout-minutes']).toBeLessThanOrEqual(job['timeout-minutes'])
    const directory = mkdtempSync(join(tmpdir(), 'credentialed-bounded-step-'))
    try {
      mkdirSync(join(directory, 'ci'))
      writeFileSync(join(directory, 'ci/run-bounded.py'), readFileSync('ci/run-bounded.py'))
      const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], {
        encoding: 'utf8',
        timeout: 5000,
      })
      expect(python.status).toBe(0)
      writeFileSync(
        join(directory, 'python3'),
        [
          '#!/usr/bin/env bash',
          'printf \'%s\\n\' "$@" > "$BOUND_ARGS"',
          'exec "$REAL_PYTHON" "$@"',
        ].join('\n'),
      )
      writeFileSync(
        join(directory, 'pnpm'),
        ['#!/usr/bin/env bash', 'printf \'%s\\n\' "$@" > "$PLAYWRIGHT_ARGS"', 'exit 7'].join('\n'),
      )
      chmodSync(join(directory, 'python3'), 0o755)
      chmodSync(join(directory, 'pnpm'), 0o755)
      const result = spawnSync('bash', ['-c', step.run!], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH ?? ''}`,
          GITHUB_WORKSPACE: directory,
          GITHUB_OUTPUT: join(directory, 'outputs'),
          CREDENTIALED_JOB_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 780),
          REAL_PYTHON: python.stdout.trim(),
          BOUND_ARGS: join(directory, 'bounded-args'),
          PLAYWRIGHT_ARGS: join(directory, 'playwright-args'),
        },
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(7)
      expect(existsSync(join(directory, 'bounded-args'))).toBe(true)
      expect(readFileSync(join(directory, 'bounded-args'), 'utf8').trim().split('\n')).toEqual([
        join(directory, 'ci/run-bounded.py'),
        '420',
        'pnpm',
        'exec',
        './ci/with-node-test-options',
        'playwright',
        'test',
        '--config',
        'playwright.credentialed.config.mts',
      ])
      expect(readFileSync(join(directory, 'playwright-args'), 'utf8').trim().split('\n')).toEqual([
        'exec',
        './ci/with-node-test-options',
        'playwright',
        'test',
        '--config',
        'playwright.credentialed.config.mts',
      ])
      expect(readFileSync(join(directory, 'outputs'), 'utf8')).toBe('retried=false\n')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('uses the shared Playwright setup action for browser installs', () => {
    expect(credentialedWorkflowText).toContain('uses: ./.github/actions/setup-playwright')
    expect(credentialedWorkflowText).not.toContain("ubicloud: 'true'")
    expect(credentialedWorkflowText).not.toContain('name: Install Playwright browsers on Ubicloud')
  })

  it('does not allocate an unused worker CPU port', () => {
    expect(credentialedWorkflowText).not.toContain('WORKER_CPU_PORT')
  })

  it('lets Wrangler allocate the inspector port in CI', () => {
    expect(credentialedWorkflowText).not.toContain('INSPECTOR_PORT')
  })

  it('derives Worker browser-upload CSP origins from both credentialed image buckets', () => {
    expect(credentialedWorkflowText).toContain('--arg images_bucket "$S3_BUCKET_IMAGES"')
    expect(credentialedWorkflowText).toContain('--arg uploads_bucket "$S3_BUCKET_IMAGE_UPLOADS"')
    expect(credentialedWorkflowText).toContain(
      '"https://\\($images_bucket).s3.us-west-2.amazonaws.com"',
    )
    expect(credentialedWorkflowText).toContain(
      '"https://\\($images_bucket).s3.dualstack.us-west-2.amazonaws.com"',
    )
    expect(credentialedWorkflowText).toContain(
      '"https://\\($uploads_bucket).s3.us-west-2.amazonaws.com"',
    )
    expect(credentialedWorkflowText).toContain(
      '"https://\\($uploads_bucket).s3.dualstack.us-west-2.amazonaws.com"',
    )
    expect(credentialedWorkflowText).toContain(
      'CSP_BROWSER_UPLOAD_ORIGINS=$CSP_BROWSER_UPLOAD_ORIGINS',
    )
  })

  it('validates and forwards the dedicated staging bucket to the credentialed suite', () => {
    expect(credentialedWorkflowText).toContain('S3_BUCKET_IMAGE_UPLOADS:\n        required: false')
    expect(credentialedWorkflowText).toContain(
      'S3_BUCKET_IMAGE_UPLOADS: ${{ secrets.S3_BUCKET_IMAGE_UPLOADS }}',
    )
    expect(credentialedWorkflowText).toContain(
      'echo "S3_BUCKET_IMAGE_UPLOADS=$S3_BUCKET_IMAGE_UPLOADS" >> "$GITHUB_ENV"',
    )
    expect(credentialedWorkflowText).toContain('if [ -z "${S3_BUCKET_IMAGE_UPLOADS:-}" ]; then')
    expect(ciText).toContain(
      "S3_BUCKET_IMAGE_UPLOADS: ${{ needs.changes.outputs.trusted-secret-context == 'true' && secrets.S3_BUCKET_IMAGE_UPLOADS || '' }}",
    )
  })

  it('uses the same-origin Worker asset route and consumes the shared build', () => {
    expect(credentialedWorkflowText).not.toContain('NEXT_PUBLIC_ASSET_PREFIX:')
    expect(credentialedWorkflowText).not.toContain('CSP_ASSET_ORIGIN=http://localhost')
    expect(credentialedWorkflowText).toContain('shared-build-cache-mode: consumer')
    expect(credentialedWorkflowText).not.toContain(
      'NEXT_PUBLIC_ASSET_PREFIX=http://localhost:$NEXT_PORT',
    )
    expect(credentialedWorkflowText).not.toContain('CSP_ASSET_ORIGIN=http://localhost:$NEXT_PORT')
  })

  it('does not allocate Chromium-restricted ports for browser-facing servers', () => {
    expect(browserSafePortsScript).toContain('"fetch-forbidden-ports.json"')
    expect(browserSafePortsScript).not.toContain('--forbidden-ports')
    expect(FETCH_FORBIDDEN_PORTS).toEqual(expect.arrayContaining([4045, 6667, 10_080]))
  })

  it('installs JavaScript dependencies before allocating ports', () => {
    const install = credentialedWorkflowText.indexOf('- uses: ./.github/actions/setup-backend')
    const allocate = credentialedWorkflowText.indexOf('- name: Allocate ports')
    expect(install).toBeGreaterThan(-1)
    expect(allocate).toBeGreaterThan(install)
  })

  it('allocates every credentialed Playwright port in one print-and-exit call', () => {
    expect(credentialedWorkflowText.match(/allocate-browser-safe-ports\.py/g)).toHaveLength(1)
    expect(credentialedWorkflowText).toContain(
      'PORTS=$(python3 ci/allocate-browser-safe-ports.py 4)',
    )
    expect(credentialedWorkflowText).toContain(
      'read -r PORT NEXT_PORT IMAGE_LAMBDA_PORT WORKER_PORT <<< "$PORTS"',
    )
  })

  it('selects every owning suite when shared port allocation inputs change', () => {
    const allocatorPath = 'ci/allocate-browser-safe-ports.py'

    for (const filterName of ['backend', 'web-integration']) {
      expect(primaryPathFilters[filterName]).toContain('ts-shared/**')
    }
    for (const filterName of ['playwright', 'playwright-credentialed']) {
      expect(primaryPathFilters[filterName]).toContain('ts-shared/utils/**')
    }
    expect(primaryPathFilters['cloudflare-worker']).toEqual(
      expect.arrayContaining([allocatorPath, 'ts-shared/**']),
    )
    const allocatorOwningFilters = Object.values(primaryPathFilters).filter(paths =>
      paths.includes(allocatorPath),
    )
    expect(allocatorOwningFilters).not.toHaveLength(0)
    expect(primaryPathFilters['runtime-playwright']?.[0]).toContain('ts-shared/utils/**')
    expect(primaryPathFilters['runtime-web-integration']?.[0]).toContain('ts-shared/**')
  })

  it('detect-changes filter step exposes filters for all credentialed job outputs', () => {
    expect(filterNames.size).toBeGreaterThan(0)
    expect(trustedJobEntries.length).toBeGreaterThan(0)
  })

  it('compiles the localization catalog before credentialed Playwright starts the API', () => {
    const compile = credentialedWorkflowText.indexOf('Compile localization catalog')
    const run = credentialedWorkflowText.indexOf('Run Playwright credentialed tests')
    expect(compile).toBeGreaterThan(-1)
    expect(compile).toBeLessThan(run)
    expect(credentialedWorkflowText).toContain('compile-cli.mts')
    expect(credentialedWorkflowText).toContain('/dev/shm')
    expect(credentialedWorkflowText).toContain('LOCALIZATION_SQLITE_PATH')
  })

  it.each(trustedJobEntries)(
    '%s: all detect-changes outputs in if-condition have a matching filter',
    (jobName, job) => {
      const referencedFilters = extractFilterOutputs(job.if ?? '')
      for (const filterName of referencedFilters) {
        assertWorkflowInvariant(
          filterNames.has(filterName),
          `Job "${jobName}" references needs.changes.outputs.${filterName} in its if-condition, ` +
            `but "${filterName}" is not defined as a filter in the detect-changes step.\n` +
            `Add a "${filterName}:" filter block to .github/ci-path-filters.yml.`,
        )
      }
    },
  )
})
