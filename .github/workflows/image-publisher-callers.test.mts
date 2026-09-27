import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = {
  if?: string
  needs?: string[]
  permissions?: Record<string, string>
  secrets?: Record<string, string>
  uses?: string
  with?: Record<string, unknown>
}
type Workflow = { jobs?: Record<string, Job>; on?: { workflow_call?: { secrets?: unknown } } }

function workflow(path: string): Workflow {
  return load(readFileSync(`.github/workflows/${path}`, 'utf8')) as Workflow
}

describe.each(['backend', 'web'] as const)('%s image publisher callers', group => {
  const area = workflow(`${group}.yml`)
  const validate = area.jobs?.[`validate-${group}-images`]
  const publish = area.jobs?.[`publish-${group}-images`]

  it('keeps pull requests read-only and merge groups write-authorized', () => {
    expect(validate?.uses).toBe(`./.github/workflows/publish-${group}-images.yml`)
    expect(validate?.if).toContain("github.event_name == 'pull_request'")
    expect(validate?.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      'id-token': 'write',
      packages: 'read',
    })
    expect(publish?.uses).toBe(`./.github/workflows/publish-${group}-images.yml`)
    expect(publish?.if).toContain("github.event_name == 'merge_group'")
    expect(publish?.if).toContain("startsWith(github.ref, 'refs/heads/gh-readonly-queue/main/')")
    expect(publish?.permissions).toEqual({
      actions: 'read',
      attestations: 'write',
      contents: 'read',
      'id-token': 'write',
      packages: 'write',
    })
  })

  it('gates on both validation and queue publication results', () => {
    const gate = area.jobs?.[group]
    expect(gate?.needs).toContain(`validate-${group}-images`)
    expect(gate?.needs).toContain(`publish-${group}-images`)
    const source = readFileSync(`.github/workflows/${group}.yml`, 'utf8')
    expect(source).toContain(`"validate-${group}-images":{"result":`)
    expect(source).toContain(`"publish-${group}-images":{"result":`)
  })
})

describe('web Sentry publication boundary', () => {
  const web = workflow('web.yml')

  it('passes the optional token only to the merge-group publisher', () => {
    expect(web.on?.workflow_call?.secrets).toHaveProperty('SENTRY_AUTH_TOKEN')
    expect(web.jobs?.['validate-web-images']?.secrets).not.toHaveProperty('SENTRY_AUTH_TOKEN')
    expect(web.jobs?.['publish-web-images']?.secrets?.['SENTRY_AUTH_TOKEN']).toContain(
      'secrets.SENTRY_AUTH_TOKEN',
    )
    expect(workflow('nightly.yml').jobs?.web?.secrets).not.toHaveProperty('SENTRY_AUTH_TOKEN')
  })
})

describe('Nightly reusable-call permission ceiling', () => {
  const nightly = workflow('nightly.yml')

  it.each(['backend', 'web'])('covers the %s area union without enabling an event path', group => {
    expect(nightly.jobs?.[group]?.permissions).toEqual({
      actions: 'read',
      attestations: 'write',
      contents: 'read',
      'id-token': 'write',
      packages: 'write',
      'pull-requests': 'read',
    })
  })
})
