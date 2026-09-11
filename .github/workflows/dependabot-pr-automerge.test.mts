import { readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const path = '.github/workflows/dependabot-pr-automerge.yml'
const source = readFileSync(path, 'utf8')
const workflow = parse(source) as {
  jobs: Record<
    string,
    {
      if?: string
      permissions?: Record<string, string>
      steps?: Array<{ name?: string; uses?: string; with?: Record<string, string> }>
    }
  >
  permissions: Record<string, string>
}

describe('Dependabot PR auto-merge integration', () => {
  it('delegates generic policy to an immutable shared action', () => {
    const actionStep = workflow.jobs.automerge.steps?.find(
      step => step.name === 'Evaluate Dependabot update',
    )

    expect(actionStep?.uses).toMatch(
      /^vouchington\/vouchington-tooling\/\.github\/actions\/dependabot-automerge@[a-f0-9]{40}$/,
    )
    expect(actionStep?.with).toEqual({
      automerge_token: '${{ secrets.DEPENDABOT_AUTOMERGE_TOKEN }}',
    })
    expect(source).not.toMatch(/actions\/github-script|function parseSemver|swift|dotnet|nuget/i)
  })

  it('keeps trusted reads scoped and stale auto-merge cleanup serialized', () => {
    expect(workflow.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' })
    expect(workflow.jobs.automerge.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    })
    expect(workflow.jobs.automerge.if).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    )
    expect(workflow.jobs.automerge.if).toContain(
      "startsWith(github.event.pull_request.head.ref, 'dependabot/')",
    )
    const cleanup = workflow.jobs['cleanup-retargeted-automerge']
    expect(cleanup.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' })
    expect(cleanup.if).toContain(
      'github.event.pull_request.base.ref != github.event.repository.default_branch',
    )
    expect(cleanup.if).toContain("startsWith(github.event.pull_request.head.ref, 'dependabot/')")
    expect(source.match(/secrets\.DEPENDABOT_AUTOMERGE_TOKEN/g)).toHaveLength(2)
  })
})
