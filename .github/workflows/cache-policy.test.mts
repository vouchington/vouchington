import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  actionStepBlocks,
  inlineLocalComposites,
  stepLists,
  workflowYamlPaths as yamlPaths,
  type PolicyStep as CacheStep,
} from '../test-helpers/pnpm-policy.fixtures.mts'
import { assertNoWorkflowViolations } from '../test-helpers/workflow-fixtures.mts'

type CacheWorkflow = {
  jobs?: Record<
    string,
    {
      'runs-on'?: string | string[]
      steps?: CacheStep[]
    }
  >
}

const workflowFileNames = readdirSync('.github/workflows').filter(
  file => file.endsWith('.yml') || file.endsWith('.yaml'),
)

function cachePathBlocks(source: string): string[] {
  return actionStepBlocks(source, /uses:\s+actions\/cache(?:\/restore|\/save)?@/)
}

function setupNodeBlocks(source: string): string[] {
  return actionStepBlocks(source, /uses:\s+actions\/setup-node@/)
}

function isPlaywrightInstallStep(step: CacheStep): boolean {
  const run = step.run ?? ''
  return run.includes('playwright install')
}

function isActionsCacheStep(step: CacheStep): boolean {
  return (
    step.uses?.startsWith('actions/cache@') === true ||
    step.uses?.startsWith('actions/cache/restore@') === true ||
    step.uses?.startsWith('actions/cache/save@') === true
  )
}

function cacheStepPath(step: CacheStep): string {
  const path = step.with?.path
  if (typeof path === 'string') return path
  if (Array.isArray(path))
    return path.filter((entry): entry is string => typeof entry === 'string').join('\n')
  return ''
}

function isPlaywrightCacheStep(step: CacheStep): boolean {
  return isActionsCacheStep(step) && cacheStepPath(step).includes('ms-playwright')
}

describe('CI cache policy', () => {
  it('never enables npm package manager caches', () => {
    // actions/setup-node's built-in `cache:` input is banned outright: it
    // cannot be pinned to a commit SHA, it manages its own opaque key
    // scheme, and it cannot cache Playwright browsers. Playwright jobs use
    // explicit, SHA-pinned actions/cache steps so their keys and scope stay
    // under our control.
    for (const path of yamlPaths) {
      const source = readFileSync(path, 'utf8')

      expect(source).not.toMatch(/^\s+cache:\s*['"]?(?:npm|pnpm|yarn)['"]?/m)
      expect(source).not.toContain('pnpm-cache:')
      for (const block of setupNodeBlocks(source)) {
        expect(block).not.toMatch(/^\s+cache:/m)
      }
    }
  })

  it('caches Playwright browsers at every real install site', () => {
    // No runner persists ~/.cache/ms-playwright across runs, so every browser
    // install site needs a preceding actions/cache step. Local composites are
    // inlined recursively to check their callers like standalone install steps.
    const violations: string[] = []

    for (const file of workflowFileNames) {
      const path = join('.github/workflows', file)
      const workflow = load(readFileSync(path, 'utf8')) as CacheWorkflow

      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        const steps = inlineLocalComposites(job.steps ?? [])

        steps.forEach((step, index) => {
          const priorSteps = steps.slice(0, index)

          if (isPlaywrightInstallStep(step) && !priorSteps.some(isPlaywrightCacheStep)) {
            violations.push(
              `${file}#${jobId}: step "${step.name ?? 'Playwright install'}" installs ` +
                `Playwright browsers without a preceding actions/cache step for ~/.cache/ms-playwright.`,
            )
          }
        })
      }
    }

    assertNoWorkflowViolations(
      violations,
      'Every Playwright install site must be preceded by an actions/cache step:',
    )
  })

  it('disables Docker build record uploads on build and bake actions', () => {
    const buildWebImagesAction = readFileSync('.github/actions/build-web-images/action.yml', 'utf8')
    const buildBackendImagesAction = readFileSync(
      '.github/actions/build-backend-images/action.yml',
      'utf8',
    )
    const explainAnalyzeWorkflow = readFileSync('.github/workflows/explain-analyze.yml', 'utf8')

    expect(buildWebImagesAction).toContain("DOCKER_BUILD_RECORD_UPLOAD: 'false'")
    expect(buildWebImagesAction).toContain("DOCKER_BUILD_SUMMARY: 'false'")
    expect(buildBackendImagesAction).toContain("DOCKER_BUILD_RECORD_UPLOAD: 'false'")
    expect(explainAnalyzeWorkflow).toContain('name: Upload EXPLAIN ANALYZE results')
    expect(explainAnalyzeWorkflow).toContain('if: always()')
  })

  it('keeps the buildx provenance object out of every Docker build metadata log', () => {
    const dockerBuildSteps = stepLists.flatMap(({ owner, steps }) =>
      steps
        .filter(step => /^docker\/(?:bake|build-push)-action@/.test(step.uses ?? ''))
        .map(step => ({
          owner,
          step: step.name,
          provenance: step.env?.BUILDX_METADATA_PROVENANCE,
        })),
    )

    expect(dockerBuildSteps.length).toBeGreaterThanOrEqual(3)
    expect(dockerBuildSteps).toEqual(
      dockerBuildSteps.map(step => ({ ...step, provenance: 'disabled' })),
    )
  })

  it('keys the Playwright browser cache safely', () => {
    // Playwright caches must scope by OS/arch and key on a lockfile content
    // hash computed by a preceding shell step. They must never declare
    // restore-keys: a stale cache can mismatch the pinned browser version.
    const violations: string[] = []
    const lockfileHashKeyRe = /\$\{\{\s*steps\.[\w-]+\.outputs\.lockfile-hash\s*\}\}/
    const lockfileHashComputeRe =
      /lockfile-hash=\$\(\s*(?:sha256sum|shasum -a 256)\s+pnpm-lock\.yaml/

    for (const path of yamlPaths) {
      const source = readFileSync(path, 'utf8')

      for (const block of cachePathBlocks(source)) {
        const isPlaywright = block.includes('ms-playwright')
        if (!isPlaywright) continue

        const firstLine = block.trim().split('\n')[0]

        if (!lockfileHashKeyRe.test(block)) {
          violations.push(`${path}: "${firstLine}" must key on steps.*.outputs.lockfile-hash.`)
        } else if (!lockfileHashComputeRe.test(source)) {
          violations.push(`${path}: "${firstLine}" keys on lockfile-hash but no step computes it.`)
        }
        if (!block.includes('runner.os') || !block.includes('runner.arch')) {
          violations.push(`${path}: "${firstLine}" must scope its key by runner.os/runner.arch.`)
        }
        if (isPlaywright && block.includes('restore-keys:')) {
          violations.push(`${path}: Playwright cache "${firstLine}" must not declare restore-keys.`)
        }
      }
    }

    assertNoWorkflowViolations(violations, 'Cache steps must be keyed safely:')
  })
})
