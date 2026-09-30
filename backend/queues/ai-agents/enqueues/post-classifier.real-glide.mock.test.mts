import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai_agents } from '../queues.mts'
import {
  enqueueBulkPostClassifiers,
  postClassifierJobExists,
  postClassifierJobId,
} from './post-classifier.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

function receiptJobData() {
  return {
    applicationId: randomUUID(),
    postId: randomUUID(),
    inputSha256: Buffer.alloc(32, 1).toString('hex'),
    configurationSha256: Buffer.alloc(32, 2).toString('hex'),
    detectorPackageVersion: '0.4.3',
  }
}

describe('post classifier bulk enqueue (real GlideMQ)', () => {
  const applicationIds: string[] = []

  afterEach(async () => {
    await Promise.all(
      applicationIds.splice(0).map(async applicationId => {
        await (await ai_agents.getJob(postClassifierJobId(applicationId)))?.remove()
      }),
    )
  })

  it('reports only the jobs it adds and skips a receipt whose stable-id job still exists', async () => {
    const first = receiptJobData()
    const second = receiptJobData()
    applicationIds.push(first.applicationId, second.applicationId)
    await expect(postClassifierJobExists(first.applicationId)).resolves.toBe(false)

    await expect(enqueueBulkPostClassifiers([first])).resolves.toEqual([first.applicationId])

    await expect(postClassifierJobExists(first.applicationId)).resolves.toBe(true)
    await expect(enqueueBulkPostClassifiers([first, second])).resolves.toEqual([
      second.applicationId,
    ])
    await expect(enqueueBulkPostClassifiers([first, second])).resolves.toEqual([])
  })

  it('releases the stable identity when the job is removed, so the sweep may add it again', async () => {
    const receipt = receiptJobData()
    applicationIds.push(receipt.applicationId)
    await enqueueBulkPostClassifiers([receipt])

    await (await ai_agents.getJob(postClassifierJobId(receipt.applicationId)))?.remove()

    await expect(postClassifierJobExists(receipt.applicationId)).resolves.toBe(false)
    await expect(enqueueBulkPostClassifiers([receipt])).resolves.toEqual([receipt.applicationId])
  })
})
