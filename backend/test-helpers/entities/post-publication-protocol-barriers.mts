import { beginTransaction, write } from '@data-stores/psql'

/** Exercise the actual singleton lock without resetting its monotonic rollout state. */
export async function testConcurrentPublicationActivationBarrier(
  observeBlocked: (readBlocked: () => Promise<boolean>) => Promise<void>,
): Promise<void> {
  await using first = await beginTransaction()
  await using second = await beginTransaction()
  await using activation = await beginTransaction()
  await first(
    `/* holdFirstPublicationWriterBarrier */ SELECT singleton, set_config('voucha.post_publication_protocol', 'typed-v1', true) FROM post_publication_identity_protocol WHERE singleton FOR SHARE`,
  )
  await second(
    `/* holdSecondPublicationWriterBarrier */ SELECT singleton, set_config('voucha.post_publication_protocol', 'typed-v1', true) FROM post_publication_identity_protocol WHERE singleton FOR SHARE`,
  )
  const { rows } = await activation<{ pid: number }>(
    `/* identifyPublicationActivationConnection */ SELECT pg_backend_pid() AS pid`,
  )
  const readBlocked = async () => {
    const { rows: state } = await write<{ blocked: boolean }>(
      `/* observePublicationActivationBarrier */ SELECT wait_event_type = 'Lock' AS blocked FROM pg_stat_activity WHERE pid = $1`,
      [rows[0]!.pid],
    )
    return state[0]?.blocked ?? false
  }
  const pending = activation(
    `/* simulatePublicationOperatorActivation */ UPDATE post_publication_identity_protocol SET protocol_version = 'typed-v1', activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP) WHERE singleton`,
  )
  try {
    await observeBlocked(readBlocked)
    await first.commit()
    await observeBlocked(readBlocked)
    await second.commit()
    await pending
    await activation.commit()
  } catch (error) {
    await first.rollback()
    await second.rollback()
    await pending.catch(() => undefined)
    throw error
  }
}
