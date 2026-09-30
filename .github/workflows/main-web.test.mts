import { readFileSync } from 'node:fs'

import YAML from 'yaml'
import { describe, expect, it } from 'vitest'

const mainWeb = readFileSync('.github/workflows/main-web.yml', 'utf8')
const mainBackend = readFileSync('.github/workflows/main-backend.yml', 'utf8')

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('main-web workflow', () => {
  it('contains only image publication selection, intent, and publication jobs', () => {
    const parsed = YAML.parse(mainWeb) as { jobs?: Record<string, unknown> }

    expect(Object.keys(parsed.jobs ?? {}).toSorted()).toEqual([
      'detect-image-publication',
      'publish-web-images',
      'web-deploy-intent',
    ])
  })

  it('runs producer-owned main workflows when shared API fixtures change', () => {
    expect(mainBackend).toContain("- 'api-fixtures/**'")
    expect(mainWeb).toContain("- 'api-fixtures/**'")
  })

  it('runs owning checks when shared type and workspace inputs change', () => {
    for (const path of ['backend/types/**', 'ts-shared/**', 'pnpm-workspace.yaml']) {
      expect(mainWeb).toContain(`- '${path}'`)
    }
    for (const path of ['.squawk.toml', 'pnpm-workspace.yaml']) {
      expect(mainBackend).toContain(`- '${path}'`)
    }
  })

  it('deploys web after build without waiting for infra', () => {
    expect(mainWeb).not.toContain("needs.wait-infra-apply.result == 'success'")
  })

  it('publishes only when the shared publication-intent detector selects web images', () => {
    const publish = jobSection(mainWeb, 'publish-web-images')

    expect(publish).toContain('needs: [detect-image-publication]')
    expect(publish).toContain("if: needs.detect-image-publication.outputs.publish == 'true'")
    expect(mainWeb).not.toContain('store-playwright-otel')
  })

  it('leaves source-only deployment metadata to the completed-run receiver', () => {
    expect(mainWeb).not.toContain('source_workflow:')
    expect(mainWeb).not.toContain('main-deploy-eligibility')
  })
})
