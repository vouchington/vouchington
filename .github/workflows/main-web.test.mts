import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const mainWeb = readFileSync('.github/workflows/main-web.yml', 'utf8')
const mainBackend = readFileSync('.github/workflows/main-backend.yml', 'utf8')
const mainStorybook = readFileSync('.github/workflows/main-storybook.yml', 'utf8')

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('main-web workflow', () => {
  it('leaves the main Playwright suite on the shared hosted-calibrated shard formula', () => {
    const playwrightTests = jobSection(mainWeb, 'playwright-tests')

    expect(playwrightTests).toContain('uses: ./.github/workflows/tests-playwright.yml')
    expect(playwrightTests).not.toContain('shard_total_override')
  })

  it('runs web API and full-stack integration as siblings after web unit tests', () => {
    for (const job of ['test-web-api', 'test-web-integration']) {
      const section = jobSection(mainWeb, job)
      expect(section).toContain('needs: [static-checks, test-web]')
      expect(section).not.toContain('max-parallel')
    }
  })

  it('runs lock-aware main workflows when the shared lock helpers change', () => {
    for (const workflow of [mainStorybook]) {
      expect(workflow).toContain("- 'ci/with-host-lock.sh'")
      expect(workflow).toContain("- 'ci/with-build-lock.sh'")
    }
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

  it('gates web checks on the static-checks workflow', () => {
    const staticChecksJob = jobSection(mainWeb, 'static-checks')

    expect(staticChecksJob).toContain('uses: ./.github/workflows/checks-static.yml')
    expect(staticChecksJob).toContain('web: true')
  })

  it('leaves source-only deployment metadata to the completed-run receiver', () => {
    expect(mainWeb).not.toContain('source_workflow:')
    expect(mainWeb).not.toContain('main-deploy-eligibility')
  })
})
