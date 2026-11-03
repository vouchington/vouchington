import assert from 'node:assert/strict'
import { vi } from 'vitest'
import { backgroundCpu as crawlReferralLinksQueue } from '../queues/background-cpu/queues.mts'

/** Fails the one bulk admission carrying the owned link; every other admission runs for real. */
export function failOwnedBulkAdmission(linkId: string, error: Error) {
  const original = crawlReferralLinksQueue.addBulk as typeof crawlReferralLinksQueue.addBulk
  const owned: Parameters<typeof original>[0][] = []
  const spy = vi.spyOn(crawlReferralLinksQueue, 'addBulk').mockImplementation(((
    ...args: Parameters<typeof original>
  ) => {
    if (args[0].some(job => (job.data as { linkId?: string }).linkId === linkId)) {
      owned.push(args[0])
      throw error
    }
    return Reflect.apply(original, crawlReferralLinksQueue, args) as ReturnType<typeof original>
  }) as typeof original)
  return { owned, restore: () => spy.mockRestore() }
}

export function assertFailedAdmission(
  owned: Parameters<typeof crawlReferralLinksQueue.addBulk>[0][],
  rateLimitMs: number,
  expected: { linkId: string; urlId: string; referralProgramId: string; hostnameId: string },
) {
  assert.equal(owned.length, 1)
  assert.deepEqual(
    owned[0]!.map(job => job.data),
    [
      {
        linkId: expected.linkId,
        urlId: expected.urlId,
        referralProgramId: expected.referralProgramId,
      },
    ],
  )
  const ordering = owned[0]![0]!.opts?.ordering
  assert.equal(ordering?.key, `crawl:${expected.hostnameId}`)
  assert.deepEqual(ordering?.rateLimit, { max: 1, duration: rateLimitMs })
}
