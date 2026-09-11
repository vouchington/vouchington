import { read } from '@data-stores/psql'

type SupportMessageRunSeed = {
  readonly threadId: string
  readonly latestInboundMessageId: string
  readonly activeAutomaticRunId: string
  readonly activeAutomaticRunClaimToken: string
  readonly completedKeyedRunId: string
  readonly completedKeyedRunClaimToken: string
}

export async function assertSeededSupportAgentRuns(seed: SupportMessageRunSeed): Promise<void> {
  const { rows } = await read<{
    id: string
    support_thread_id: string
    support_message_id: string
    claim_token: string | null
    completed: boolean
  }>(
    `/* assertSeededSupportAgentRuns */
      SELECT id, support_thread_id, support_message_id, claim_token,
        completed_at IS NOT NULL AS completed
      FROM support_agent_runs
      WHERE id = $1 OR id = $2`,
    [seed.activeAutomaticRunId, seed.completedKeyedRunId],
  )
  const expectedRuns = [
    {
      id: seed.activeAutomaticRunId,
      claimToken: seed.activeAutomaticRunClaimToken,
      completed: false,
    },
    { id: seed.completedKeyedRunId, claimToken: seed.completedKeyedRunClaimToken, completed: true },
  ]
  for (const expected of expectedRuns) {
    const run = rows.find(row => row.id === expected.id)
    if (
      !run ||
      run.support_thread_id !== seed.threadId ||
      run.support_message_id !== seed.latestInboundMessageId ||
      run.claim_token !== expected.claimToken ||
      run.completed !== expected.completed
    ) {
      throw new Error(`Seeded support agent run ${expected.id} was missing or had unexpected state`)
    }
  }
}
