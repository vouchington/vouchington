import { runSequentially } from '@modules/utils/run-sequentially'
import {
  assertSafeSqlIdentifier,
  buildMonthlyPartitionName,
  DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS,
  DEFAULT_MONTHLY_PARTITION_PAST_MONTHS,
  expectedMonthlyPartitionBound,
  type MonthlyPartitionTableConfig,
} from '@vouchington/postgres/partitions'
import { beginTransaction } from '../setup.mts'

export const POST_CLEARANCE_CHANGES = 'post_clearance_changes'

export async function createPostClearancePartitions(
  config: Pick<MonthlyPartitionTableConfig, 'pastMonths' | 'futureMonths'>,
  baseDate?: Date,
): Promise<void> {
  const pastMonths = config.pastMonths ?? DEFAULT_MONTHLY_PARTITION_PAST_MONTHS
  const futureMonths = config.futureMonths ?? DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS
  if (
    !Number.isInteger(pastMonths) ||
    pastMonths < 0 ||
    !Number.isInteger(futureMonths) ||
    futureMonths < 0
  ) {
    throw new Error('Post clearance partition month counts must be non-negative integers')
  }
  const referenceDate = baseDate ?? new Date()
  const partitions: { name: string; bound: string }[] = []
  for (let offset = -pastMonths; offset <= futureMonths; offset++) {
    const monthStart = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + offset, 1),
    )
    const year = monthStart.getUTCFullYear()
    const month = monthStart.getUTCMonth() + 1
    partitions.push({
      name: assertSafeSqlIdentifier(buildMonthlyPartitionName(POST_CLEARANCE_CHANGES, year, month)),
      bound: expectedMonthlyPartitionBound(year, month),
    })
  }

  await using transaction = await beginTransaction()
  await transaction(`/* createPostClearancePartitions:lockPosts */
    LOCK TABLE posts IN SHARE ROW EXCLUSIVE MODE`)
  const { rows } = await transaction<{
    name: string
    bound: string | null
    detach_pending: boolean
  }>(
    `/* createPostClearancePartitions:attachedChildren */
    SELECT child.relname::text AS name, pg_get_expr(child.relpartbound, child.oid) AS bound,
      inheritance.inhdetachpending AS detach_pending
    FROM pg_partitioned_table AS parent
    JOIN pg_inherits AS inheritance ON inheritance.inhparent = parent.partrelid
    JOIN pg_class AS child ON child.oid = inheritance.inhrelid
    JOIN pg_class AS parent_table ON parent_table.oid = parent.partrelid
    WHERE parent.partrelid = 'post_clearance_changes'::regclass
      AND (child.oid = parent.partdefid OR
        (child.relnamespace = parent_table.relnamespace AND child.relname = ANY($1::name[])))`,
    [partitions.map(partition => partition.name)],
  )
  if (rows.some(row => row.bound === 'DEFAULT')) {
    throw new Error('Unexpected default partition for post_clearance_changes')
  }
  const attached = new Map(rows.map(row => [row.name, row]))
  const missing = partitions.filter(({ name, bound }) => {
    const child = attached.get(name)
    if (child && (child.bound !== bound || child.detach_pending)) {
      throw new Error(`Unexpected state for post clearance partition ${name}`)
    }
    return !child
  })
  // ATTACH lets feedback FK checks read the parent while it installs FK triggers.
  await runSequentially(
    missing.flatMap(({ name, bound }) => [
      () =>
        transaction(`/* createPostClearancePartitions:createChild */
          CREATE TABLE ${name} (LIKE post_clearance_changes INCLUDING ALL)`),
      () =>
        transaction(`/* createPostClearancePartitions:attachChild */
          ALTER TABLE post_clearance_changes ATTACH PARTITION ${name} ${bound}`),
    ]),
  )
  await transaction.commit()
}
