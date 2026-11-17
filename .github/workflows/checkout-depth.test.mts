import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = { uses?: string; with?: Record<string, unknown> }
type Doc = { jobs?: Record<string, { steps?: Step[] }>; runs?: { steps?: Step[] } }

// Reads the whole main history to decide which images main still reaches.
const fullHistory = new Set(['.github/workflows/ghcr-cleanup.yml'])

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return files(path)
    return /\.ya?ml$/.test(entry.name) ? [path] : []
  })
}

function checkouts(path: string): Step[] {
  const doc = load(readFileSync(path, 'utf8')) as Doc
  const steps = [
    ...Object.values(doc.jobs ?? {}).flatMap(job => job.steps ?? []),
    ...(doc.runs?.steps ?? []),
  ]
  return steps.filter(step => step.uses?.startsWith('actions/checkout@'))
}

describe('checkout depth', () => {
  const paths = [...files('.github/workflows'), ...files('.github/actions')]

  it('finds the checkouts it audits', () => {
    expect(paths.flatMap(checkouts).length).toBeGreaterThan(30)
  })

  it.each(paths)('%s fetches every branch and tag only when it needs main history', path => {
    const full = checkouts(path).filter(step => step.with?.['fetch-depth'] === 0)
    expect(full.length > 0).toBe(fullHistory.has(path))
  })
})

type Retryable = Step & { run?: string } & {
  id?: string
  if?: string
  'continue-on-error'?: boolean
  'timeout-minutes'?: number
}

// Workflows whose checkout carries its own id, condition, or history needs, or publishes images
// under a pinned step shape, and is not retried here.
const unretried = new Set([
  '.github/workflows/ci-upload-codecov.yml',
  '.github/workflows/ghcr-cleanup.yml',
  '.github/workflows/publish-backend-images.yml',
  '.github/workflows/publish-web-images.yml',
  '.github/workflows/tests-playwright-credentialed.yml',
])

describe('checkout network retry', () => {
  const paths = files('.github/workflows').filter(path => !unretried.has(path))

  it.each(paths)('%s retries each checkout once with short step timeouts', path => {
    const doc = load(readFileSync(path, 'utf8')) as {
      jobs?: Record<string, { steps?: Retryable[] }>
    }
    for (const job of Object.values(doc.jobs ?? {})) {
      const steps = job.steps ?? []
      // no-mistakes tsconfig-gate-coverage stops counting tsc steps after a continue-on-error step.
      if (steps.some(candidate => candidate.run?.includes('tsc --noEmit'))) continue
      steps.forEach((step, index) => {
        if (!step.uses?.startsWith('actions/checkout@') || step.if) return
        const retry = steps[index + 1]
        expect(step['continue-on-error']).toBe(true)
        expect(typeof step['timeout-minutes']).toBe('number')
        expect(retry?.uses).toBe(step.uses)
        expect(retry?.with).toEqual(step.with)
        expect(retry?.if).toBe(`steps.${step.id}.outcome != 'success'`)
        expect(retry?.['timeout-minutes']).toBe(step['timeout-minutes'])
        expect(retry?.['continue-on-error']).toBeUndefined()
      })
    }
  })
})
