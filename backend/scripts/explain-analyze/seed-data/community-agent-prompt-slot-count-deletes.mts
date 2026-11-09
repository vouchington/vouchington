/** One user-delete statement stays small enough that its FK SET NULL probes finish inside statement_timeout. */
export const SLOT_NOISE_USER_DELETE_BATCH = 50

type SlotNoiseQuery = (text: string, values?: readonly unknown[]) => Promise<unknown>

export class SlotNoiseUserDeleteError extends Error {
  readonly batchSize: number
  readonly statementCode: string

  constructor(batchSize: number, statementCode: string, detail: string, cause: unknown) {
    super(detail, { cause })
    this.name = 'SlotNoiseUserDeleteError'
    this.batchSize = batchSize
    this.statementCode = statementCode
  }
}

/**
 * Deletes slot-noise users in bounded statements. One DELETE of the 1000-id cohort runs
 * ON DELETE SET NULL per id, and that trigger update hit statement_timeout.
 */
export async function deleteSlotNoiseUsers(
  query: SlotNoiseQuery,
  systemUserIds: readonly string[],
  creatorIds: readonly string[],
): Promise<void> {
  await query(
    `/* cleanupCommunityAgentPromptSlotCountNoise:customPlan */
    SELECT set_config('plan_cache_mode', 'force_custom_plan', true)`,
  )
  await deleteUserBatches(query, 'systemUsers', systemUserIds)
  await deleteUserBatches(query, 'creators', creatorIds)
}

async function deleteUserBatches(
  query: SlotNoiseQuery,
  name: string,
  ids: readonly string[],
): Promise<void> {
  const batches = Math.ceil(ids.length / SLOT_NOISE_USER_DELETE_BATCH)
  for (let index = 0; index < batches; index++) {
    const batch = ids.slice(
      index * SLOT_NOISE_USER_DELETE_BATCH,
      (index + 1) * SLOT_NOISE_USER_DELETE_BATCH,
    )
    const started = performance.now()
    try {
      // no-mistakes-disable-next-line query-reached-per-item: each statement deletes one bounded slot-noise user batch so the users FK SET NULL cannot cover the whole cohort.
      await query(
        `/* cleanupCommunityAgentPromptSlotCountNoise:${name} */
        DELETE FROM users WHERE id = ANY($1::uuid[])`,
        [batch],
      )
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - started)
      const statementCode =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : ''
      throw new SlotNoiseUserDeleteError(
        batch.length,
        statementCode,
        `cleanupCommunityAgentPromptSlotCountNoise ${name} batch ${index + 1}/${batches} size ${batch.length} failed after ${elapsedMs}ms${statementCode === '' ? '' : ` (${statementCode})`}`,
        err,
      )
    }
  }
}
