import { v7 } from 'uuid'
import type { CopyrightSeedContext } from '../scripts/seed/copyright-context.mts'
import { readTestDatabaseTimestamp } from './database-clock.mts'

/** Own every seed replay key; capture one real database clock without waiting or changing it. */
export async function createCopyrightSeedInputsForTest(): Promise<CopyrightSeedContext> {
  const intakeReviewKey = v7()
  const deadlineKey = v7()
  return {
    now: new Date(await readTestDatabaseTimestamp()),
    identity: {
      namespace: `dev-seed-copyright-${v7()}`,
      postId: v7(),
      imageId: v7(),
      placementId: v7(),
      intakeReviewKey,
      deadlineKey,
      submissionId: v7(),
      assessmentId: v7(),
      deadlineId: v7(),
      intakeIpAddress: addressFor(intakeReviewKey),
      deadlineIpAddress: addressFor(deadlineKey),
    },
  }
}

function addressFor(id: string): string {
  const groups = id.replaceAll('-', '').slice(8).match(/.{4}/g)
  if (!groups) throw new Error('Expected UUIDv7 address material')
  return `2001:db8:${groups.join(':')}`
}

/** Complete every started staff read before propagating any original rejection. */
export async function settleCopyrightSeedReads<T>(reads: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(reads)
  const reasons: unknown[] = []
  for (const result of settled)
    if (result.status === 'rejected' && !reasons.some(reason => Object.is(reason, result.reason)))
      reasons.push(result.reason)
  if (reasons.length === 1) throw reasons[0]
  if (reasons.length > 1) throw new AggregateError(reasons, 'Copyright seed reads failed')
  return settled.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
}
