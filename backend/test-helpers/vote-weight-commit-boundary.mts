import { beginTransaction } from '@data-stores/psql'

/** Keep an owned writer transaction open while comparing exact PostgreSQL timestamps. */
export async function withOpenVoteWeightWriterTransaction(
  run: (isBefore: (boundary: string) => Promise<boolean>) => Promise<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ at: string }>(
    '/* withOpenVoteWeightWriterTransaction */ SELECT CURRENT_TIMESTAMP::text AS at',
  )
  const startedAt = rows[0]!.at
  await run(async boundary => {
    const { rows: comparisons } = await transaction<{ before: boolean }>(
      '/* withOpenVoteWeightWriterTransaction */ SELECT $1::timestamptz < $2::timestamptz AS before',
      [boundary, startedAt],
    )
    return comparisons[0]?.before ?? false
  })
}
