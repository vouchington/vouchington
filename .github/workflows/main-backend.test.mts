import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

function ciBackendFilter(): string[] {
  const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
    string,
    string[]
  >
  return filters.backend ?? []
}

describe('main-backend workflow', () => {
  it('selects backend PR validation and main publication when the CI package boundary changes', () => {
    expect(ciBackendFilter()).toContain('ci/package.json')

    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    expect(workflow).toContain("- 'ci/package.json'")
  })

  it('triggers the main backend workflow when the generated INSERT guard changes', () => {
    const guard = 'ci/generated-ddl-inserts/generated-ddl-insert-invariants.mts'
    expect(ciBackendFilter()).toContain('ci/generated-ddl-inserts/**')

    const workflow = load(readFileSync('.github/workflows/main-backend.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }
    const pushPaths = workflow.on?.push?.paths ?? []
    expect(pushPaths).toContain('ci/generated-ddl-inserts/**')
    expect(pushPaths.some(glob => picomatch.isMatch(guard, glob, { dot: true }))).toBe(true)
  })

  it('triggers the main backend workflow when the live MCP catalog checker changes', () => {
    const checker = 'ci/check-live-mcp-catalog.mjs'
    const registration = 'ci/mcp-tool-file-registration.mts'
    expect(ciBackendFilter()).toContain(checker)
    expect(ciBackendFilter()).toContain(registration)

    const workflow = load(readFileSync('.github/workflows/main-backend.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }
    const pushPaths = workflow.on?.push?.paths ?? []
    expect(pushPaths).toContain(checker)
    expect(pushPaths).toContain(registration)
    expect(pushPaths.some(glob => picomatch.isMatch(checker, glob, { dot: true }))).toBe(true)
    expect(pushPaths.some(glob => picomatch.isMatch(registration, glob, { dot: true }))).toBe(true)
  })

  it('triggers the main backend workflow when the scheduled-job schedule checker changes', () => {
    const checker = 'ci/check-scheduled-job-schedules.mts'
    expect(ciBackendFilter()).toContain(checker)

    const workflow = load(readFileSync('.github/workflows/main-backend.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }
    const pushPaths = workflow.on?.push?.paths ?? []
    expect(pushPaths).toContain(checker)
    expect(pushPaths.some(glob => picomatch.isMatch(checker, glob, { dot: true }))).toBe(true)
  })

  it('triggers the main backend workflow when the shipped topic CSV checker changes', () => {
    const checker = 'ci/check-seed-topic-csvs.mts'
    const policy = 'ci/seed-topic-csv-policy.mts'
    const rows = 'ci/seed-topic-csv-rows.mts'
    const feed = 'ci/seed-topic-csv-feed.mts'
    const shippedCsv = 'seed/ai-topics.csv'
    expect(ciBackendFilter()).toContain(checker)
    expect(ciBackendFilter()).toContain(policy)
    expect(ciBackendFilter()).toContain(rows)
    expect(ciBackendFilter()).toContain(feed)
    expect(ciBackendFilter()).toContain('seed/*-topics.csv')

    const workflow = load(readFileSync('.github/workflows/main-backend.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }
    const pushPaths = workflow.on?.push?.paths ?? []
    expect(pushPaths).toContain(checker)
    expect(pushPaths).toContain(policy)
    expect(pushPaths).toContain(rows)
    expect(pushPaths).toContain(feed)
    expect(pushPaths).toContain('seed/*-topics.csv')
    expect(pushPaths.some(glob => picomatch.isMatch(checker, glob, { dot: true }))).toBe(true)
    expect(pushPaths.some(glob => picomatch.isMatch(shippedCsv, glob, { dot: true }))).toBe(true)
  })
})
