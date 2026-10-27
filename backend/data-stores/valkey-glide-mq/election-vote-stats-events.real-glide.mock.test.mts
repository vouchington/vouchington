import { describe, expect, it, vi } from 'vitest'
import { acquireNativeElectionEventFixture } from '../../test-helpers/election-vote-stats-events-native.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('owned election queue terminal streams', () => {
  it('observes another process and retains completion after the owned job is removed', async () => {
    const owned = await acquireNativeElectionEventFixture()
    expect(owned.workerPid).not.toBe(process.pid)
    const job = await owned.add('completed')
    if (!job) throw new Error('Expected concrete owned admission')
    const end = await owned.observer.wait(job.id)
    const receipt = await owned.receipt(job.id)
    expect(receipt).toEqual({ type: 'completed', id: job.id, pid: owned.workerPid })
    expect(end).toEqual({ id: job.id, failed: false })
    await job.remove()
    await expect(owned.observer.wait(job.id)).resolves.toEqual(end)
  })

  it('reports a real failed job processed in another process by its exact returned ID', async () => {
    const owned = await acquireNativeElectionEventFixture()
    const job = await owned.add('failed', { attempts: 1 })
    if (!job) throw new Error('Expected concrete owned admission')
    const end = await owned.observer.wait(job.id)
    expect(await owned.receipt(job.id)).toEqual({
      type: 'failed',
      id: job.id,
      pid: owned.workerPid,
    })
    expect(end).toEqual({
      id: job.id,
      failed: true,
      failedReason: 'Owned worker processor failure',
    })
  })

  it('rejects an unsatisfied exact-ID wait on close rather than fabricating completion', async () => {
    const owned = await acquireNativeElectionEventFixture()
    await expect(owned.stopWorker()).resolves.toEqual({ code: 0, signal: null })
    const job = await owned.add('waiting')
    if (!job) throw new Error('Expected concrete owned waiting admission')
    const waiting = owned.observer.wait(job.id)
    const rejected = waiting.catch(err => err)
    await owned.observer.close()
    expect(await rejected).toMatchObject({ message: 'Owned election observer is closed' })
    await expect(owned.observer.wait('')).rejects.toThrow('concrete owned job ID')
    await owned.close()
  })
})
