import { describe, expect, it } from 'vitest'
import { defineScheduledJobManifest, projectScheduledJobs } from './index.mts'
import type { ScheduledJobDefinition } from './types.mts'

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
