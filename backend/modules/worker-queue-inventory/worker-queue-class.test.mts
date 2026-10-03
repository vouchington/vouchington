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
const KNOWN = ['emails', 'images', 'heartbeat']

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
    expect(resolveQueueSelection({}, ['all'], KNOWN)).toBeUndefined()
    expect(resolveQueueSelection({ QUEUES: '-emails,-images' }, ['all'], KNOWN)).toBe(
      '-emails,-images',
    )
  })

  it('treats a blank class as unset', () => {
    expect(
      resolveQueueSelection({ WORKER_QUEUE_CLASS: '  ', QUEUES: 'emails' }, ['io'], KNOWN),
    ).toBe('emails')
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: '' }, ['io'], KNOWN)).toBeUndefined()
  })

  it('expands each class to an explicit include list of policy queue names', () => {
    const accepted = ['all', 'cpu', 'io'] as const

    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: 'all' }, accepted, KNOWN)).toBe(
      `${CPU},${IO}`,
    )
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, accepted, KNOWN)).toBe(CPU)
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: ' io ' }, accepted, KNOWN)).toBe(IO)
  })

  it('ignores a blank QUEUES next to a class', () => {
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu', QUEUES: ' ' }, ['cpu'], KNOWN)).toBe(
      CPU,
    )
  })

  it('rejects a class the entrypoint does not accept, naming the accepted values', () => {
    expect(() => resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, ['io'], KNOWN)).toThrow(
      'WORKER_QUEUE_CLASS must be one of io for this worker, got "cpu"',
    )
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'io' }, ['all', 'cpu'], KNOWN),
    ).toThrow('WORKER_QUEUE_CLASS must be one of all, cpu for this worker, got "io"')
    expect(() => resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, ['io'], KNOWN)).toThrow(
      WorkerQueueClassError,
    )
    expect(() => resolveQueueSelection({ WORKER_QUEUE_CLASS: 'cpu' }, ['io'], KNOWN)).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_QUEUE_CLASS' }),
    )
  })

  it('rejects an unknown class', () => {
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'gpu' }, ['all', 'cpu', 'io'], KNOWN),
    ).toThrow('got "gpu"')
  })

  it('rejects setting both selectors, even when the class is invalid', () => {
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'io', QUEUES: 'emails' }, ['io'], KNOWN),
    ).toThrow('WORKER_QUEUE_CLASS and QUEUES are mutually exclusive')
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'io', QUEUES: 'emails' }, ['io'], KNOWN),
    ).toThrow(expect.objectContaining({ code: 'CONFLICTING_QUEUE_SELECTORS' }))
    expect(() =>
      resolveQueueSelection({ WORKER_QUEUE_CLASS: 'gpu', QUEUES: 'emails' }, ['io'], KNOWN),
    ).toThrow('mutually exclusive')
  })
})

describe('resolveQueueSelection with QUEUES naming queues the worker does not run', () => {
  const select = (queues: string) => resolveQueueSelection({ QUEUES: queues }, ['all'], KNOWN)

  it('rejects an unknown included name, listing it', () => {
    expect(() => select('emails,retired-queue')).toThrow(
      'QUEUES names queues this worker does not run: retired-queue',
    )
    expect(() => select('emails,retired-queue')).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_QUEUE_NAMES' }),
    )
  })

  it('rejects an unknown excluded name, listing it without the exclude prefix', () => {
    expect(() => select('-emails,-retired-queue')).toThrow(
      'QUEUES names queues this worker does not run: retired-queue',
    )
  })

  it('lists every unknown name once, in the order they were given', () => {
    expect(() => select(' retired-queue , emails,other-retired-queue,retired-queue')).toThrow(
      'does not run: retired-queue, other-retired-queue',
    )
  })

  it('accepts names the worker runs, whether included or excluded, and returns them untouched', () => {
    expect(select('emails,images')).toBe('emails,images')
    expect(select('-emails,-heartbeat')).toBe('-emails,-heartbeat')
  })

  it('leaves blank selections and malformed lists for the queue parser to handle', () => {
    expect(select('  ')).toBe('  ')
    expect(select('emails,,images')).toBe('emails,,images')
    expect(select('emails,-images')).toBe('emails,-images')
  })

  it('does not check the policy-derived list a class expands to', () => {
    expect(resolveQueueSelection({ WORKER_QUEUE_CLASS: 'io' }, ['io'], [])).toBe(IO)
  })
})
