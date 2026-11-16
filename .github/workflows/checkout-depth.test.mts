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
