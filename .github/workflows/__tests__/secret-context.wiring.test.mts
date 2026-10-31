import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('secret-backed workflow context gates (wiring and routing)', () => {
  it('skips orchestrated secret-backed jobs on untrusted bot or fork PRs', () => {
    const guardedJobs = [
      ['backend', 'validate-backend-images'],
      ['backend', 'publish-backend-images'],
      ['backend', 'test-backend-credentialed'],
      ['web', 'validate-web-images'],
      ['web', 'publish-web-images'],
      ['web', 'test-playwright-credentialed'],
    ]

    for (const [area, job] of guardedJobs) {
      const workflow = read(`.github/workflows/${area}.yml`)
      expect(jobSection(workflow, job)).toContain(
        "needs.changes.outputs.trusted-secret-context == 'true'",
      )
      expect(jobSection(workflow, job)).toContain(
        "trusted_secret_context: ${{ needs.changes.outputs.trusted-secret-context == 'true' }}",
      )
    }
  })
})
