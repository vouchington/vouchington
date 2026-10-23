import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { read } from '@data-stores/psql'
import { mintUUIDv7 } from '@modules/utils/ids'
import { backgroundCpu } from '../queues/background-cpu/queues.mts'
import { onEnqueueAdmission } from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import {
  createProviderReplay,
  parseRecordedResponse,
  type ProviderReplay,
} from 'vouchington-tooling/provider-replay'
import { createOwnedSqlFixtureLifetime } from './owned-sql-fixture-lifetime.mts'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from './entities/bedrock-embeddings-batches.mts'

/** Exact one-integer UUID interval: no unrelated UUID can fit between its boundaries. */
function oneBatchCursor(id: string) {
  const value = BigInt(`0x${id.replaceAll('-', '')}`)
  if (value <= 0n || value >= (1n << 128n) - 1n)
    throw new RangeError('Batch UUID needs both neighbours')
  const format = (number: bigint) => {
    const hex = number.toString(16).padStart(32, '0')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return { afterId: format(value - 1n), throughId: format(value + 1n) }
}

export async function createOwnedBedrockRouterFixtures(
  installReplay: (replay: ProviderReplay) => () => void,
) {
  const context = new AsyncLocalStorage<boolean>()
  const ids: string[] = []
  const receipts: Array<{ id: string; name: string; data: unknown }> = []
  const admissions: Promise<unknown>[] = []
  const replay = createProviderReplay()
  let restoreReplay: (() => void) | undefined
  let stop: (() => void) | undefined
  const owner = createOwnedSqlFixtureLifetime(async () => {
    const failures: unknown[] = []
    for (const admission of admissions) {
      const [result] = await Promise.allSettled([admission])
      if (result!.status === 'rejected') failures.push(result!.reason)
    }
    for (const receipt of receipts) {
      try {
        const job = await backgroundCpu.getJob(receipt.id)
        if (!job) continue
        if (job.name !== receipt.name || JSON.stringify(job.data) !== JSON.stringify(receipt.data))
          throw new Error('Owned job receipt changed before cleanup')
        await job.remove()
      } catch (err) {
        failures.push(err)
      }
    }
    stop?.()
    try {
      restoreReplay?.()
    } catch (err) {
      failures.push(err)
    }
    // Retain SQL witnesses if exact job removal failed; no live job loses its row identity.
    if (failures.length === 0) {
      try {
        await cleanupTestEmbeddingsBatches(ids)
      } catch (err) {
        failures.push(err)
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Owned Bedrock fixture cleanup failed')
  })
  try {
    await owner.prepare(async () => {
      restoreReplay = installReplay(replay)
      stop = onEnqueueAdmission(event => {
        if (!context.getStore() || event.queue !== backgroundCpu) return
        const completed = event.completion.then(value => {
          for (const job of Array.isArray(value) ? value : [value]) {
            if (!job || typeof job !== 'object' || !('id' in job) || !job.id) continue
            if (!('name' in job) || !('data' in job))
              throw new Error('Owned enqueue returned no job identity')
            receipts.push({ id: String(job.id), name: String(job.name), data: job.data })
          }
          return undefined
        })
        admissions.push(completed)
        void completed.catch(() => {})
      })
    })
    const insert = (stale: boolean) =>
      owner.run(async () => {
        const id = mintUUIDv7()
        const arn = `arn:aws:bedrock:us-east-1:123456789012:model-invocation-job/${randomUUID()}`
        await insertTestEmbeddingsBatch({
          id,
          jobArn: arn,
          submittedAt: new Date(Date.now() - (stale ? 14 : 1) * 24 * 3600_000),
        })
        ids.push(id)
        return { id, arn, cursor: oneBatchCursor(id) }
      })
    const [pending, stale, foreign] = await Promise.all([insert(false), insert(true), insert(true)])
    const readForeign = () =>
      read<{ row: unknown }>(
        '/* ownedBedrockRouterForeign */ SELECT to_jsonb(batch) AS row FROM bedrock_embedding_batches batch WHERE id = $1',
        [foreign.id],
      ).then(result => result.rows)
    const foreignBefore = await owner.run(readForeign)
    return {
      ...owner,
      pending,
      stale,
      foreign,
      foreignBefore,
      readForeign: () => owner.run(readForeign),
      run: <Result,>(operation: () => Promise<Result>) =>
        owner.run(() => context.run(true, operation)),
      respondCompleted() {
        replay.respondWith(
          parseRecordedResponse(
            Buffer.from(
              `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ status: 'Completed', jobArn: stale.arn })}`,
            ),
          ),
        )
      },
      requests: replay.requests,
      assertReplayDrained: replay.assertDrained,
      receipts,
    }
  } catch (err) {
    const [closed] = await Promise.allSettled([owner.close()])
    if (closed!.status === 'rejected')
      throw new AggregateError([err, closed!.reason], 'Bedrock fixture setup and cleanup failed', {
        cause: err,
      })
    throw err
  }
}
