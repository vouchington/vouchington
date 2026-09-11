import { describe, expect, it, vi } from 'vitest'
import {
  defineScheduledJobManifest,
  projectScheduledJobs,
  upsertScheduledJobManifest,
} from './index.mts'
import type { ScheduledJobDefinition, ScheduledJobQueue } from './types.mts'

function makeQueue(upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler']): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: async () => [],
    removeJobScheduler: async () => undefined,
  }
}

function scheduledJob(id: string): ScheduledJobDefinition {
  return {
    schedulerId: `${id}-scheduler`,
    repeat: { pattern: '* * * * *' } as const,
    template: { name: `${id}-job`, data: {}, opts: {} },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs' as const,
        id,
        schedule: '* * * * *',
        description: `Run ${id}`,
        trigger: () => undefined,
      },
    ],
  }
}

describe('scheduled job manifest catalog contracts', () => {
  it('rejects an incomplete or duplicate projection order', () => {
    const manifest = defineScheduledJobManifest('example', [
      scheduledJob('first'),
      scheduledJob('second'),
    ])

    expect(() => projectScheduledJobs([manifest], ['first'])).toThrow(
      'missing=[second], unknown=[], duplicates=[]',
    )
    expect(() => projectScheduledJobs([manifest], ['first', 'first'])).toThrow(
      'missing=[second], unknown=[], duplicates=[first]',
    )
  })

  it('projects production-only jobs independently of worker runtime environment', () => {
    const manifest = defineScheduledJobManifest('example', [
      { ...scheduledJob('production'), environment: 'production' },
    ])

    expect(projectScheduledJobs([manifest]).map(job => job.id)).toEqual(['production'])
  })

  it('omits template data when its runtime resolver returns undefined', async () => {
    const upsertJobScheduler = vi
      .fn<ScheduledJobQueue['upsertJobScheduler']>()
      .mockResolvedValue(undefined)
    const definition = scheduledJob('undefined-data')
    const manifest = defineScheduledJobManifest('example', [
      {
        ...definition,
        template: { ...definition.template, data: undefined, dataFactory: () => undefined },
      },
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)

    expect(upsertJobScheduler.mock.calls[0]?.[2]).not.toHaveProperty('data')
  })

  it('does not execute function-valued data unless it is an explicit dataFactory', async () => {
    const upsertJobScheduler = vi
      .fn<ScheduledJobQueue['upsertJobScheduler']>()
      .mockResolvedValue(undefined)
    const functionData = vi.fn<() => void>()
    const definition = scheduledJob('function-data')
    const manifest = defineScheduledJobManifest('example', [
      {
        ...definition,
        template: {
          name: definition.template.name,
          opts: definition.template.opts,
          data: functionData,
        },
      },
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)

    expect(functionData).not.toHaveBeenCalled()
    expect(upsertJobScheduler.mock.calls[0]?.[2].data).toBe(functionData)
  })

  it('tracks every parallel registration when one throws synchronously', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>(schedulerId => {
      if (schedulerId === 'first-scheduler') throw new Error('synchronous registration failure')
      return Promise.resolve()
    })
    const manifest = defineScheduledJobManifest('example', [
      scheduledJob('first'),
      scheduledJob('second'),
    ])

    await expect(
      upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest),
    ).rejects.toThrow('synchronous registration failure')
    expect(upsertJobScheduler.mock.calls.map(([schedulerId]) => schedulerId)).toEqual([
      'first-scheduler',
      'second-scheduler',
    ])
  })

  it('rejects duplicate operator ids across otherwise distinct jobs', () => {
    const first = scheduledJob('duplicate')
    const second = { ...scheduledJob('duplicate'), schedulerId: 'second-scheduler' }

    expect(() => defineScheduledJobManifest('example', [first, second])).toThrow(
      'Duplicate scheduled-job operator id: duplicate',
    )
  })

  it('rejects duplicate backfill and PostgreSQL operator identities', () => {
    const first = scheduledJob('first')
    const second = scheduledJob('second')

    expect(() =>
      defineScheduledJobManifest('example', [
        { ...first, operatorSurfaces: [{ kind: 'backfill', backfillId: 'shared' }] },
        { ...second, operatorSurfaces: [{ kind: 'backfill', backfillId: 'shared' }] },
      ]),
    ).toThrow('Duplicate scheduled-job operator backfill id: shared')
    expect(() =>
      defineScheduledJobManifest('example', [
        { ...first, operatorSurfaces: [{ kind: 'psql', jobType: 'shared' }] },
        { ...second, operatorSurfaces: [{ kind: 'psql', jobType: 'shared' }] },
      ]),
    ).toThrow('Duplicate scheduled-job operator psql job type: shared')
  })

  it('rejects malformed runtime manifest values with explicit diagnostics', () => {
    const definition = scheduledJob('malformed')

    expect(() => defineScheduledJobManifest(1 as never, [definition])).toThrow(
      'queueName must be a string',
    )
    expect(() =>
      defineScheduledJobManifest('example', [
        { ...definition, operatorSurfaces: [{ kind: 'typo' }] as never },
      ]),
    ).toThrow('Unknown operator surface kind: typo')
    expect(() =>
      defineScheduledJobManifest('example', [
        {
          ...definition,
          template: { ...definition.template, data: undefined, dataFactory: 'invalid' } as never,
        },
      ]),
    ).toThrow('dataFactory must be a function')
  })
})
