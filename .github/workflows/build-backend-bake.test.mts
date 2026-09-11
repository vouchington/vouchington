import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  id?: string
  if?: string
  name?: string
  'timeout-minutes'?: number
  uses?: string
  with?: Record<string, string>
}

const source = readFileSync('.github/workflows/build-backend.yml', 'utf8')
const workflow = load(source) as { jobs?: { build?: { steps?: Step[] } } }
const steps = workflow.jobs?.build?.steps ?? []

describe('build-backend Bake topology', () => {
  it('runs exactly one bounded Bake invocation for the selected backend image set', () => {
    const buildxSteps = steps.filter(step => step.uses?.startsWith('docker/setup-buildx-action@'))
    expect(buildxSteps).toHaveLength(1)
    expect(buildxSteps[0]).toMatchObject({
      id: 'buildx',
      with: { 'buildkitd-config-inline': expect.stringContaining('max-parallelism = 3') },
    })
    expect(source.match(/^[ \t]*max-parallelism = \d+$/gmu)).toHaveLength(1)

    const bakes = steps.filter(step => step.uses?.startsWith('docker/bake-action@'))
    expect(steps.indexOf(buildxSteps[0]!)).toBeLessThan(steps.indexOf(bakes[0]!))
    expect(
      bakes.map(step => [
        step.name,
        step.id,
        step.with?.targets,
        step.with?.builder,
        step.with?.files?.trim(),
        step.if,
        step['timeout-minutes'],
      ]),
    ).toEqual([
      [
        'Build core backend images',
        'bake-core',
        'api,worker-cpu',
        '${{ steps.buildx.outputs.name }}',
        './backend/docker-bake.hcl\n${{ steps.meta-api.outputs.bake-file }}\n${{ steps.meta-worker-cpu.outputs.bake-file }}',
        "${{ steps.images.outputs.worker_io_automation_enabled != 'true' }}",
        10,
      ],
      [
        'Build all backend images',
        'bake-all',
        'api,worker-cpu,worker-io',
        '${{ steps.buildx.outputs.name }}',
        './backend/docker-bake.hcl\n${{ steps.meta-api.outputs.bake-file }}\n${{ steps.meta-worker-cpu.outputs.bake-file }}\n${{ steps.meta-worker-io.outputs.bake-file }}',
        "${{ steps.images.outputs.worker_io_automation_enabled == 'true' }}",
        10,
      ],
    ])

    expect(bakes.map(step => step.if)).toEqual([
      "${{ steps.images.outputs.worker_io_automation_enabled != 'true' }}",
      "${{ steps.images.outputs.worker_io_automation_enabled == 'true' }}",
    ])
  })
})
