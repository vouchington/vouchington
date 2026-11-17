import assert from 'http-assert'

/** Fields every run-gated AI draft save records; each service owns its own static SQL. */
export interface RunGatedDraftFields {
  runId: string
  recommendedAction: string
  model: string
}

/** Lifecycle-change metadata recorded with every AI draft save. */
export function aiDraftLifecycleMetadata(input: RunGatedDraftFields): string {
  return JSON.stringify({
    model: input.model,
    recommended_action: input.recommendedAction,
    run_id: input.runId,
  })
}

/**
 * Settles a run-gated draft save: returns the saved row, 404s when the parent is gone, and
 * returns null when the parent exists but the run no longer applies.
 */
export async function settleRunGatedAiDraft<Row>(
  saved: Row | undefined,
  findParentId: () => Promise<string | undefined>,
  notFoundMessage: string,
): Promise<Row | null> {
  if (saved) return saved
  assert(await findParentId(), 404, notFoundMessage)
  return null
}
