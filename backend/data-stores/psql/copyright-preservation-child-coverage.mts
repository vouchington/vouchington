import type { QueryExecutor } from '@data-stores/psql'
import { readUserCopyrightPreservationCoverage } from '@data-stores/psql/copyright-preservation-coverage'
import { COPYRIGHT_CASE_POINTER_CUTS } from './copyright-case-purge-pointers.mts'
import { COPYRIGHT_CASE_PURGE_PHASES } from './copyright-case-purge-order.mts'
import { identifier, type Edge } from './copyright-case-purge-path.mts'

// The base inventory already consumes these entire case-owned families.
const COVERED_FAMILIES = new Set([
  'copyright_notice_lifecycle_changes',
  'copyright_notice_email_thread_retirements',
  'copyright_notice_evidence_artifacts',
  'copyright_notice_email_intake_notice_links',
  'copyright_notice_email_thread_references',
  'copyright_notice_email_message_ancestors',
])

const pointerColumns = new Map<string, readonly string[]>(COPYRIGHT_CASE_POINTER_CUTS)

const paths: readonly (readonly Edge[])[] = [
  ...COPYRIGHT_CASE_PURGE_PHASES.flatMap(phase =>
    COVERED_FAMILIES.has(phase[0]) ? [] : [phase[1]],
  ),
  // The intake's current recommendation is updated through the case's immutable link.
  [
    [
      'copyright_notice_email_intake_notice_links',
      ['copyright_notice_id'],
      ['id'],
      ['id'],
      ['id'],
      ['id'],
    ],
    [
      'copyright_notice_email_intakes',
      ['id'],
      ['copyright_notice_email_intake_id'],
      ['id'],
      ['id'],
      ['id'],
    ],
  ],
  // Replay receipts are final-tail owners, even when they have no decision children.
  [
    [
      'copyright_territorial_notice_receipts',
      ['copyright_notice_id'],
      ['id'],
      ['id'],
      ['id'],
      ['id'],
    ],
  ],
]
const uniquePaths = [
  ...new Map(
    paths.map(path => [JSON.stringify(path.map(edge => [edge[0], edge[1], edge[2]])), path]),
  ).values(),
]

function familyCount(path: readonly Edge[], index: number): string {
  const [first] = path
  const joins = path
    .slice(1)
    .map((edge, offset) => {
      const position = offset + 1
      const on = edge[1]
        .map(
          (column, key) =>
            `family_${position}.${identifier(column)} = family_${offset}.${identifier(edge[2][key]!)}`,
        )
        .join(' AND ')
      return `JOIN ${identifier(edge[0])} family_${position} ON ${on}`
    })
    .join('\n')
  const last = path.at(-1)!
  const columns = pointerColumns.get(last[0])
  const projection = columns
    ? [
        'count(*)',
        ...columns.map(column => `count(family_${path.length - 1}.${identifier(column)})`),
      ].join(' + ')
    : 'count(*)'
  return `(SELECT ${projection} FROM ${identifier(first![0])} family_0 ${joins}
    WHERE family_0.${identifier(first![1][0]!)} = ANY($1::uuid[])) AS family_${index}`
}

const coverageSql = `/* readCopyrightCasePreservationChildren */ SELECT
  ${uniquePaths.map(familyCount).join(',\n')}`

/** Read every remaining legal-record leaf through its canonical case FK path before a hold commits. */
export async function readCopyrightCaseChildPreservationCoverage(
  query: QueryExecutor,
  caseIds: readonly string[],
): Promise<void> {
  if (caseIds.length === 0) return
  // Counts consume the complete held cohort without transferring an unbounded record list.
  await query(coverageSql, [caseIds])
}

/** Consume the account's complete case inventory and remaining legal children in the hold transaction. */
export async function readUserCopyrightHoldCoverage(
  query: QueryExecutor,
  userId: string,
): Promise<void> {
  const cases = await readUserCopyrightPreservationCoverage(query, userId)
  await readCopyrightCaseChildPreservationCoverage(query, cases)
}
