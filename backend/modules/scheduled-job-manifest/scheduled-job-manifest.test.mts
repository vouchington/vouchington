import { describe, expect, it } from 'vitest'
import type { ScheduledJobDefinition } from './types.mts'
import {
  defineScheduledJobManifest,
  projectScheduledJobs,
  validateScheduledJobManifests,
} from './index.mts'

describe('scheduled job manifests', () => {
  it('defines a typed manifest with nonempty operator surfaces', () => {
    const manifest = defineScheduledJobManifest('example', [job()])
    expect(manifest.jobs[0]!.operatorSurfaces).toHaveLength(1)
  })

  it('accepts an empty job list as a tombstone so leftover schedulers can still be deleted', () => {
    expect(defineScheduledJobManifest('example', []).jobs).toEqual([])
  })

  it('rejects duplicate queue and scheduler identities', () => {
    const manifest = defineScheduledJobManifest('example', [job()])
    expect(() => validateScheduledJobManifests([manifest, manifest])).toThrow(
      'Duplicate scheduled job: example/example-scheduler',
    )
  })

  it('rejects empty identifiers, descriptions, schedules, and operator surface arrays', () => {
    expect(() =>
      defineScheduledJobManifest('example', [{ ...job(), operatorSurfaces: [] as never }]),
    ).toThrow('must define an operator surface')
    expect(() => defineScheduledJobManifest('', [job()])).toThrow(
      'queueName must be a nonempty string',
    )
    const surface = job().operatorSurfaces[0]
    if (surface.kind !== 'scheduled-jobs') throw new Error('Expected scheduled-job surface')
    expect(() =>
      defineScheduledJobManifest('example', [
        {
          ...job(),
          operatorSurfaces: [{ ...surface, description: '' }],
        },
      ]),
    ).toThrow('operator description must be a nonempty string')
    expect(() => defineScheduledJobManifest('example', [{ ...job(), schedulerId: '' }])).toThrow(
      'schedulerId must be a nonempty string',
    )
    expect(() =>
      defineScheduledJobManifest('example', [{ ...job(), repeat: { pattern: '' } }]),
    ).toThrow('repeat pattern must be a nonempty string')
    expect(() =>
      defineScheduledJobManifest('example', [{ ...job(), repeat: { every: 0 } }]),
    ).toThrow('repeat every must be a positive finite number')
    expect(() =>
      defineScheduledJobManifest('example', [
        { ...job(), repeat: { pattern: '* * * * *', every: 1000 } as never },
      ]),
    ).toThrow('repeat must define exactly one')
    expect(() =>
      defineScheduledJobManifest('example', [
        { ...job(), operatorSurfaces: [{ ...surface, id: '' }] },
      ]),
    ).toThrow('scheduled-job operator id must be a nonempty string')
    expect(() =>
      defineScheduledJobManifest('example', [
        { ...job(), operatorSurfaces: [{ ...surface, schedule: '' }] },
      ]),
    ).toThrow('operator schedule must be a nonempty string')
  })

  it('projects scheduled-job surfaces into the API registry shape', () => {
    const definition = job()
    const surface = definition.operatorSurfaces[0]
    if (surface.kind !== 'scheduled-jobs') throw new Error('Expected scheduled-job surface')
    const manifest = defineScheduledJobManifest('example', [definition])
    expect(projectScheduledJobs([manifest])).toEqual([
      {
        id: 'example-scheduler',
        queue_name: 'example',
        job_name: 'example-job',
        schedule: '* * * * *',
        description: 'Run the example job',
        trigger: surface.trigger,
      },
    ])
  })
})

function job(schedulerId = 'example-scheduler'): ScheduledJobDefinition {
  const trigger = () => undefined
  return {
    schedulerId,
    repeat: { pattern: '* * * * *' },
    template: { name: 'example-job', data: {}, opts: { attempts: 3 } },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: schedulerId,
        schedule: '* * * * *',
        description: 'Run the example job',
        trigger,
      },
    ],
  }
}
