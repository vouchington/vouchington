import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  id?: string
  if?: string
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type Workflow = {
  permissions?: Record<string, string>
  jobs?: Record<string, { steps?: Step[] }>
}

const readWorkflow = (path: string): [string, Workflow] => {
  const source = readFileSync(path, 'utf8')
  return [source, parseYaml(source) as Workflow]
}

const cases = [
  {
    path: '.github/workflows/publish-backend-images.yml',
    subjects: ['api', 'worker-cpu', 'worker-io'],
    outputs: ['api_digest', 'worker_cpu_digest', 'worker_io_digest'],
  },
  {
    path: '.github/workflows/publish-web-images.yml',
    subjects: ['web'],
    outputs: ['web_digest'],
  },
] as const

describe.each(cases)('$path image provenance', config => {
  const [source, workflow] = readWorkflow(config.path)
  const steps = workflow.jobs?.build?.steps ?? []
  const publishIndex = steps.findIndex(step => step.id === 'publish')

  it('grants registry attestation permissions at the reusable workflow boundary', () => {
    expect(workflow.permissions).toMatchObject({
      attestations: 'write',
      packages: 'write',
    })
  })

  it('exports each push digest and attests it after the push', () => {
    const publish = steps[publishIndex]
    expect(publish?.if).toContain('success()')
    expect(publish?.run).toContain('GITHUB_OUTPUT')
    for (const output of config.outputs) expect(publish?.run).toContain(output)

    const attestations = steps.filter(step => step.uses?.startsWith('actions/attest@'))
    expect(attestations).toHaveLength(config.subjects.length)
    for (const subject of config.subjects) {
      const step = attestations.find(
        candidate =>
          candidate.with?.['subject-name'] ===
          `ghcr.io/${'${{ github.repository_owner }}'}/${subject}`,
      )
      expect(step).toBeDefined()
      expect(step?.uses).toMatch(/^actions\/attest@[0-9a-f]{40}$/u)
      expect(step?.with?.['subject-digest']).toContain('steps.publish.outputs.')
      expect(step?.with?.['create-storage-record']).toBe(false)
      expect(step?.with?.['push-to-registry']).toBe(true)
      expect(step?.if).toContain('success()')
      expect(steps.indexOf(step!)).toBeGreaterThan(publishIndex)
    }
  })

  it('keeps the GHCR credential through attestation and logs out afterward', () => {
    expect(source).toContain('docker login ghcr.io')
    const logoutIndex = steps.findIndex(step => step.name === 'Log out of GHCR')
    expect(logoutIndex).toBeGreaterThan(publishIndex)
    expect(steps[logoutIndex]?.if).toContain('always()')
  })
})
