import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { gitSubcommandPattern } from './workflow-test-helpers.mts'

type Workflow = {
  jobs?: Record<
    string,
    {
      'runs-on'?: string | string[]
    }
  >
}

const workflowPaths = readdirSync('.github/workflows').flatMap(path =>
  path.endsWith('.yml') || path.endsWith('.yaml') ? [`.github/workflows/${path}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function runsOnUbicloudStandard2(runsOn: string | string[] | undefined): boolean {
  return Array.isArray(runsOn)
    ? runsOn.length === 1 && runsOn[0] === 'ubicloud-standard-2'
    : runsOn === 'ubicloud-standard-2'
}

describe('ephemeral (ubicloud-standard-2) runner policy', () => {
  it('keeps sensitive default-branch automation on ephemeral non-GitHub-hosted runners', () => {
    // Closed set — see reference-runner-types.md's ubicloud-standard-2 rationale.
    const expected = ['.github/workflows/pnpm-dedupe.yml#dedupe']
    const actual = workflowPaths
      .flatMap(path =>
        Object.entries(readWorkflow(path).jobs ?? {})
          .filter(([, job]) => runsOnUbicloudStandard2(job['runs-on']))
          .map(([jobId]) => `${path}#${jobId}`),
      )
      .sort()
    expect(actual).toEqual(expected)
  })

  it('keeps commit-creating workflows off persistent self-hosted runners', () => {
    for (const path of workflowPaths) {
      const raw = readFileSync(path, 'utf8')
      const setsIdentity = /\bgit config\b[^\n]*\buser\.(name|email)\b/.test(raw)
      const createsCommit = gitSubcommandPattern('commit').test(raw)
      if (!setsIdentity && !createsCommit) continue
      const workflow = readWorkflow(path)
      for (const [, job] of Object.entries(workflow.jobs ?? {})) {
        expect(runsOnUbicloudStandard2(job['runs-on'])).toBe(true)
      }
    }
  })
})
