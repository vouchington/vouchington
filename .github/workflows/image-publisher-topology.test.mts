import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  'continue-on-error'?: string
  id?: string
  if?: string
  name?: string
  run?: string
  uses?: string
}
type Job = { if?: string; steps?: Step[] }
type Workflow = { jobs?: Record<string, Job> }

function publisher(group: 'backend' | 'web'): Workflow {
  return load(readFileSync(`.github/workflows/publish-${group}-images.yml`, 'utf8')) as Workflow
}

function step(job: Job | undefined, id: string): Step {
  const found = job?.steps?.find(candidate => candidate.id === id)
  if (!found) throw new Error(`missing ${id} step`)
  return found
}

describe.each(['backend', 'web'] as const)('%s image publisher', group => {
  const workflow = publisher(group)
  const resolver = workflow.jobs?.['resolve-main-images']
  const build = workflow.jobs?.build

  it('resolves merge-queue images only for a trusted main push', () => {
    expect(resolver?.if).toContain('inputs.trusted_secret_context')
    expect(resolver?.if).toContain("github.event_name == 'push'")
    expect(resolver?.if).toContain("github.ref == 'refs/heads/main'")
  })

  it('never publishes from a pull request', () => {
    expect(step(build, 'publish').if).toBe(
      "${{ success() && (github.event_name == 'merge_group' || github.event_name == 'push') }}",
    )
  })
})

describe.each(['backend', 'web'] as const)('%s merge-group advisory publication', group => {
  const steps = publisher(group).jobs?.build?.steps ?? []
  const advisory = steps.filter(
    candidate => candidate.id === 'publish' || candidate.uses?.startsWith('actions/attest@'),
  )

  it('lets only merge groups continue past a push or attestation failure', () => {
    expect(advisory.length).toBeGreaterThan(1)
    for (const candidate of advisory)
      expect(candidate['continue-on-error']).toBe("${{ github.event_name == 'merge_group' }}")
    const others = steps.filter(candidate => !advisory.includes(candidate))
    for (const candidate of others) expect(candidate['continue-on-error']).toBeUndefined()
  })

  it('annotates an advisory failure instead of hiding it', () => {
    const report = steps.find(candidate => candidate.name?.startsWith('Report advisory'))
    expect(report?.if).toContain("github.event_name == 'merge_group'")
    for (const candidate of advisory)
      expect(report?.if).toContain(`steps.${candidate.id}.outcome == 'failure'`)
    expect(report?.run).toContain('::warning::')
  })
})
