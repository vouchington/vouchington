export type PersistedInputRow = {
  candidateId: string | null
  decisionCallId: string | undefined
  entityId: string
  probability: number
  rawResponse: string
  thresholdId: string | null
  lowerThreshold: number
  upperThreshold: number
}

/** Column-oriented arrays for one `unnest` bulk insert of a decision's result rows. */
export function buildColumnArrays(rows: readonly PersistedInputRow[]) {
  return {
    entityIds: rows.map(row => row.entityId),
    callIds: rows.map(row => row.decisionCallId!),
    candidateIds: rows.map(row => row.candidateId),
    thresholdIds: rows.map(row => row.thresholdId),
    probabilities: rows.map(row => row.probability),
    lowerThresholds: rows.map(row => row.lowerThreshold),
    upperThresholds: rows.map(row => row.upperThreshold),
    rawResponses: rows.map(row => row.rawResponse),
  }
}
