import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobDefinition, ScheduledJobQueue } from './types.mts'
import { defineScheduledJobManifest, upsertScheduledJobManifest } from './index.mts'

describe('upsertScheduledJobManifest', () => {
  it('upserts all-environment jobs and filters production-only jobs', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const queue = makeQueue(upsertJobScheduler)
    const manifest = defineScheduledJobManifest('example', [
      job(),
      { ...job('production-scheduler'), environment: 'production' },
    ])

    await upsertScheduledJobManifest(queue, manifest, { nodeEnv: 'test' })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)

    upsertJobScheduler.mockClear()
    await upsertScheduledJobManifest(queue, manifest, { nodeEnv: 'production' })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2)
  })

  it('filters production-only jobs off staging via ENVIRONMENT when no nodeEnv override is given', async () => {
    // ECS sets NODE_ENV=production on every task, staging included; only ENVIRONMENT
    // distinguishes them, so this must NOT behave like the real 'production' case below.
    // Passed as an explicit env object (not process.env mutation) so this state cannot leak
    // across parallel Vitest files.
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const queue = makeQueue(upsertJobScheduler)
    const manifest = defineScheduledJobManifest('example', [
      job(),
      { ...job('production-scheduler'), environment: 'production' },
    ])

    await upsertScheduledJobManifest(queue, manifest, {
      env: { ENVIRONMENT: 'staging', NODE_ENV: 'production' },
    })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)

    upsertJobScheduler.mockClear()
    await upsertScheduledJobManifest(queue, manifest, {
      env: { ENVIRONMENT: 'production', NODE_ENV: 'production' },
    })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2)
  })

  it('resolves runtime values at each upsert call', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    let generation = 0
    const manifest = defineScheduledJobManifest('example', [
      {
        ...job(),
        repeat: () => ({ every: ++generation }),
        subMinuteJustification: 'test fixture exercising thunk resolution, not a real cadence',
        template: {
          name: 'example-job',
          dataFactory: () => ({ generation }),
          opts: () => ({ attempts: generation }),
        },
      },
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)
    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)

    expect(upsertJobScheduler.mock.calls).toEqual([
      [
        'example-scheduler',
        { every: 1 },
        { name: 'example-job', data: { generation: 1 }, opts: { attempts: 1 } },
      ],
      [
        'example-scheduler',
        { every: 2 },
        { name: 'example-job', data: { generation: 2 }, opts: { attempts: 2 } },
      ],
    ])
  })

  it('preserves an omitted template data property', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const definition = job()
    const manifest = defineScheduledJobManifest('example', [
      { ...definition, template: { name: definition.template.name, opts: { attempts: 3 } } },
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'example-scheduler',
      { pattern: '* * * * *' },
      { name: 'example-job', opts: { attempts: 3 } },
    )
  })

  it('rejects invalid repeat values resolved at registration time', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    const manifest = defineScheduledJobManifest('example', [
      { ...job(), repeat: () => ({ every: 0 }) },
    ])

    await expect(
      upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest),
    ).rejects.toThrow('repeat every must be a positive finite number')
    expect(upsertJobScheduler).not.toHaveBeenCalled()
  })

  it('preserves sequential registration before the following parallel batch', async () => {
    const events: string[] = []
    const releases = new Map<string, () => void>()
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>(schedulerId => {
      events.push(`start:${schedulerId}`)
      return new Promise<void>(resolve => {
        releases.set(schedulerId, () => {
          events.push(`finish:${schedulerId}`)
          resolve()
        })
      })
    })
    const manifest = defineScheduledJobManifest('example', [
      { ...job('first'), registration: 'sequential' },
      { ...job('second'), registration: 'sequential' },
      job('parallel-a'),
      job('parallel-b'),
    ])

    const completion = upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)
    await vi.waitFor(() => expect(events).toEqual(['start:first']))
    releases.get('first')!()
    await vi.waitFor(() => expect(events).toEqual(['start:first', 'finish:first', 'start:second']))
    releases.get('second')!()
    await vi.waitFor(() =>
      expect(events).toEqual([
        'start:first',
        'finish:first',
        'start:second',
        'finish:second',
        'start:parallel-a',
        'start:parallel-b',
      ]),
    )
    releases.get('parallel-a')!()
    releases.get('parallel-b')!()
    await completion
  })

  it('waits for the preceding parallel batch before sequential registration', async () => {
    const events: string[] = []
    const releases = new Map<string, () => void>()
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>(schedulerId => {
      events.push(`start:${schedulerId}`)
      return new Promise<void>(resolve => {
        releases.set(schedulerId, () => {
          events.push(`finish:${schedulerId}`)
          resolve()
        })
      })
    })
    const manifest = defineScheduledJobManifest('example', [
      job('parallel-a'),
      job('parallel-b'),
      { ...job('sequential'), registration: 'sequential' },
    ])

    const completion = upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)
    await vi.waitFor(() => expect(events).toEqual(['start:parallel-a', 'start:parallel-b']))
    releases.get('parallel-a')!()
    await vi.waitFor(() =>
      expect(events).toEqual(['start:parallel-a', 'start:parallel-b', 'finish:parallel-a']),
    )
    releases.get('parallel-b')!()
    await vi.waitFor(() =>
      expect(events).toEqual([
        'start:parallel-a',
        'start:parallel-b',
        'finish:parallel-a',
        'finish:parallel-b',
        'start:sequential',
      ]),
    )
    releases.get('sequential')!()
    await completion
  })

  it('propagates a parallel registration rejection and skips the sequential barrier', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>(schedulerId =>
      schedulerId === 'parallel-a'
        ? Promise.reject(new Error('parallel registration failed'))
        : Promise.resolve(),
    )
    const manifest = defineScheduledJobManifest('example', [
      job('parallel-a'),
      job('parallel-b'),
      { ...job('sequential'), registration: 'sequential' },
    ])

    await expect(
      upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest),
    ).rejects.toThrow('parallel registration failed')
    expect(upsertJobScheduler.mock.calls.map(([schedulerId]) => schedulerId)).toEqual([
      'parallel-a',
      'parallel-b',
    ])
  })

  it('propagates a sequential registration rejection and skips later jobs', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>(schedulerId =>
      schedulerId === 'sequential'
        ? Promise.reject(new Error('sequential registration failed'))
        : Promise.resolve(),
    )
    const manifest = defineScheduledJobManifest('example', [
      { ...job('sequential'), registration: 'sequential' },
      job('later'),
    ])

    await expect(
      upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest),
    ).rejects.toThrow('sequential registration failed')
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'sequential',
      expect.anything(),
      expect.anything(),
    )
  })
})

function makeQueue(
  upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler'],
  extras: Partial<Pick<ScheduledJobQueue, 'getRepeatableJobs' | 'removeJobScheduler'>> = {},
): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: extras.getRepeatableJobs ?? (async () => []),
    removeJobScheduler: extras.removeJobScheduler ?? (async () => undefined),
  }
}

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
