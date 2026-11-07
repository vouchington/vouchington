export const READMISSION_URL_DELETE_BATCH_ROWS = 2_000

export type OwnedUrlDelete = (
  text: string,
  values: readonly unknown[],
) => Promise<{ rowCount: number | null }>

export class OwnedUrlDeleteBatchError extends Error {
  readonly limit: number
  readonly statementCode: string

  constructor(limit: number, statementCode: string, detail: string, cause: unknown) {
    super(detail, { cause })
    this.name = 'OwnedUrlDeleteBatchError'
    this.limit = limit
    this.statementCode = statementCode
  }
}

export class OwnedUrlDeleteCapError extends Error {
  readonly limit: number
  readonly batches: number

  constructor(limit: number, batches: number) {
    super(
      `deleteOwnedUrlsInBatches still deleted a full batch after ${batches} batches of ${limit}`,
    )
    this.name = 'OwnedUrlDeleteCapError'
    this.limit = limit
    this.batches = batches
  }
}

/**
 * Deletes owned URLs in bounded statements. The production pool's statement_timeout is 30s, and
 * one delete of the 100k readmission fixture can spend that whole budget inside FK cascades.
 */
export async function deleteOwnedUrlsInBatches(
  query: OwnedUrlDelete,
  hostnameId: string,
  totalRows: number,
): Promise<void> {
  if (!Number.isInteger(totalRows) || totalRows < 1)
    throw new Error(
      `deleteOwnedUrlsInBatches requires a positive integer row count, got ${totalRows}`,
    )
  const maxBatches = Math.ceil(totalRows / READMISSION_URL_DELETE_BATCH_ROWS) + 1
  for (let batch = 0; batch < maxBatches; batch++) {
    const started = performance.now()
    let deleted = 0
    try {
      // no-mistakes-disable-next-line query-reached-per-item: each cleanup statement deletes one explicitly limited owned fixture batch; the loop has a finite corpus cap.
      const result = await query(
        `/* deleteOwnedUrlsInBatches */
        WITH owned AS (SELECT id FROM urls WHERE hostname_id=$1 ORDER BY id LIMIT $2)
        DELETE FROM urls USING owned WHERE urls.id=owned.id`,
        [hostnameId, READMISSION_URL_DELETE_BATCH_ROWS],
      )
      deleted = result.rowCount ?? 0
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - started)
      const statementCode =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : ''
      throw new OwnedUrlDeleteBatchError(
        READMISSION_URL_DELETE_BATCH_ROWS,
        statementCode,
        `deleteOwnedUrlsInBatches batch ${batch + 1}/${maxBatches} limit ${READMISSION_URL_DELETE_BATCH_ROWS} failed after ${elapsedMs}ms${statementCode === '' ? '' : ` (${statementCode})`}`,
        err,
      )
    }
    if (deleted < READMISSION_URL_DELETE_BATCH_ROWS) return
  }
  throw new OwnedUrlDeleteCapError(READMISSION_URL_DELETE_BATCH_ROWS, maxBatches)
}
