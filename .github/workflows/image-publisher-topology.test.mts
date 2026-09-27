import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  env?: Record<string, string>
  id?: string
  if?: string
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}
type Job = {
  if?: string
  needs?: string[] | string
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  steps?: Step[]
}
type Workflow = {
  jobs?: Record<string, Job>
  on?: {
    workflow_call?: {
      inputs?: Record<string, unknown>
      outputs?: Record<string, { value?: string }>
    }
  }
  permissions?: unknown
}

function publisher(group: 'backend' | 'web'): Workflow {
  return load(readFileSync(`.github/workflows/publish-${group}-images.yml`, 'utf8')) as Workflow
}

function step(job: Job, id: string): Step {
  const found = job.steps?.find(candidate => candidate.id === id || candidate.name === id)
  if (!found) throw new Error(`missing ${id} step`)
  return found
}

describe.each(['backend', 'web'] as const)('%s image publisher', group => {
  const workflow = publisher(group)

  it('inherits the caller write envelope only in the build job', () => {
    expect(workflow).not.toHaveProperty('permissions')
    expect(workflow.jobs?.build).not.toHaveProperty('permissions')
    expect(workflow.jobs?.['resolve-main-images']?.permissions).toEqual({
      contents: 'read',
      packages: 'read',
    })
    expect(workflow.jobs?.['verify-main-images']?.permissions).toEqual({
      contents: 'read',
      packages: 'read',
    })
  })

  it('runs validation, queue publication, and main fallback under independent real-event guards', () => {
    const condition = workflow.jobs?.build?.if ?? ''
    expect(condition).toContain('!cancelled()')
    expect(condition).toContain("github.event_name == 'pull_request'")
    expect(condition).toContain("startsWith(github.ref, 'refs/pull/')")
    expect(condition).toContain("github.event_name == 'merge_group'")
    expect(condition).toContain("startsWith(github.ref, 'refs/heads/gh-readonly-queue/main/')")
    expect(condition).toContain("github.event_name == 'push'")
    expect(condition).toContain("github.ref == 'refs/heads/main'")
    expect(condition).toContain("needs.resolve-main-images.outputs.missing_targets != '[]'")
  })

  it('proves main ancestry before resolving and emits a fallback diagnostic without failing', () => {
    const resolver = workflow.jobs?.['resolve-main-images'] ?? {}
    expect(resolver.if).toContain("github.event_name == 'push'")
    expect(resolver.if).toContain("github.ref == 'refs/heads/main'")
    const proof = step(resolver, 'source')
    expect(proof.run).toContain('ci/verify-main-ancestor.sh')
    const plan = step(resolver, 'promotion')
    expect(plan.run).toContain(`image-promotion-cli.mts plan ${group}`)
    expect(plan.run).toContain('::error::')
    expect(plan.run).toContain('GITHUB_STEP_SUMMARY')
    expect(plan.env?.['MAIN_REACHABLE_SOURCE_SHA']).toContain('steps.source.outputs.source_sha')
    expect(plan.env?.['GHCR_PASSWORD']).toContain('github.token')
  })

  it('rechecks after building, publishes only the remaining missing targets, and verifies after attestation', () => {
    const build = workflow.jobs?.build ?? {}
    const prepare = step(build, 'prepare-publication')
    expect(prepare.run).toContain(`image-promotion-cli.mts plan ${group}`)
    expect(prepare.run).toContain('$current - $original')
    const publish = step(build, 'publish')
    expect(publish.if).toContain("steps.prepare-publication.outputs.targets != '[]'")
    expect(
      publish.env?.['TARGETS']?.includes('steps.prepare-publication.outputs.targets') ?? false,
    ).toBe(group === 'backend')
    const verifier = workflow.jobs?.['verify-main-images'] ?? {}
    expect(verifier.needs).toEqual(['resolve-main-images', 'build'])
    expect(verifier.if).toContain("needs.resolve-main-images.outputs.missing_targets != '[]'")
    const freshProof = step(verifier, 'final-source')
    expect(freshProof.run).toContain('ci/verify-main-ancestor.sh')
    expect(freshProof.env?.['SOURCE_SHA']).toContain('needs.resolve-main-images.outputs.source_sha')
    const finalPromotion = step(verifier, 'promotion')
    expect(finalPromotion.run).toContain(`image-promotion-cli.mts verify ${group}`)
    expect(finalPromotion.env?.['MAIN_REACHABLE_SOURCE_SHA']).toContain(
      'steps.final-source.outputs.source_sha',
    )
  })

  it('never substitutes the resolver partial set when final verification is required', () => {
    const output = workflow.on?.workflow_call?.outputs?.['verified_images']?.value ?? ''
    expect(output).toContain("jobs.resolve-main-images.outputs.missing_targets == '[]'")
    expect(output).toContain("jobs.resolve-main-images.outputs.missing_targets != '[]'")
    expect(output).toContain('jobs.verify-main-images.outputs.verified_images')
  })
})
