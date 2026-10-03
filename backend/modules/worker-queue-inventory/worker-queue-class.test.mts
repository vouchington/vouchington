import { describe, expect, it } from 'vitest'
import {
  WORKER_QUEUE_CLASSES,
  WorkerQueueClassError,
  isWorkerQueueClass,
  resolveQueueSelection,
  workerQueueClassQueueNames,
} from './worker-queue-class.mts'
import { workerQueuePolicy } from './worker-queue-policy.mts'

const CPU = workerQueuePolicy.cpuOnlyQueues.join(',')
const IO = workerQueuePolicy.ioCapableQueues.join(',')

describe('worker queue classes', () => {
  it('names the deployment classes infrastructure can request', () => {
    expect(WORKER_QUEUE_CLASSES).toEqual(['all', 'cpu', 'io'])
    expect(['all', 'cpu', 'io'].every(isWorkerQueueClass)).toBe(true)
    expect(['', 'ALL', 'merged', 'gpu'].some(isWorkerQueueClass)).toBe(false)
  })

  it('projects each class onto the policy queue lists', () => {
    expect(workerQueueClassQueueNames('cpu')).toEqual(workerQueuePolicy.cpuOnlyQueues)
    expect(workerQueueClassQueueNames('io')).toEqual(workerQueuePolicy.ioCapableQueues)
    expect(workerQueueClassQueueNames('all')).toEqual([
      ...workerQueuePolicy.cpuOnlyQueues,
      ...workerQueuePolicy.ioCapableQueues,
    ])
  })

  it('returns copies so callers cannot mutate the policy', () => {
    workerQueueClassQueueNames('cpu').push('mutated')
    workerQueueClassQueueNames('io').push('mutated')

    expect(workerQueuePolicy.cpuOnlyQueues).not.toContain('mutated')
    expect(workerQueuePolicy.ioCapableQueues).not.toContain('mutated')
  })
})

describe('resolveQueueSelection', () => {
  it('returns QUEUES untouched when no class is set', () => {
    expect(resolveQueueSelection({}, ['all'])).toBeUndefined()
    expect(resolveQueueSelection({ QUEUES: '-emails,-images' }, ['all'])).toBe('-emails,-images')
  })

  it('treats a blank class as unset', () => {
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: '  ', QUEUES: 'emails' }, ['io'])).toBe(
      'emails',
    )
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: '' }, ['io'])).toBeUndefined()
  })

  it('expands each class to an explicit include list of policy queue names', () => {
    const accepted = ['all', 'cpu', 'io'] as const

    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: 'all' }, accepted)).toBe(`${CPU},${IO}`)
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, accepted)).toBe(CPU)
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: ' io ' }, accepted)).toBe(IO)
  })

  it('ignores a blank QUEUES next to a class', () => {
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu', QUEUES: ' ' }, ['cpu'])).toBe(CPU)
  })

  it('rejects a class the entrypoint does not accept, naming the accepted values', () => {
    expect(() => resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, ['io'])).toThrow(
      'WORKER_QUEUE_CLASS must be one of io for this worker, got "cpu"',
    )
    expect(() => resolveQueueSelection({ WORKER_QUEUE_CLASS: 'io' }, ['all', 'cpu'])).toThrow(
      'WORKER_QUEUE_CLASS must be one of all, cpu for this worker, got "io"',
    )
    expect(() => resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, ['io'])).toThrow(
      WorkerQueueClassError,
    )
    expect(() => resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, ['io'])).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_QUEUE_CLASS' }),
    )
  })

  it('rejects an unknown class', () => {
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'gpu' }, ['all', 'cpu', 'io']),
    ).toThrow('got "gpu"')
  })

  it('rejects setting both selectors, even when the class is invalid', () => {
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'io', QUEUES: 'emails' }, ['io']),
    ).toThrow('WORKER_QUEUE_CLASS and QUEUES are mutually exclusive')
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'io', QUEUES: 'emails' }, ['io']),
    ).toThrow(expect.objectContaining({ code: 'CONFLICTING_QUEUE_SELECTORS' }))
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'gpu', QUEUES: 'emails' }, ['io']),
    ).toThrow('mutually exclusive')
  })
})
