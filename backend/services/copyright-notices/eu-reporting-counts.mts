import { read, type QueryExecutor } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

/** The stored method and SQL are derived from the same six immutable admission facts. */
export const EU_REPORT_FACTS = [
  {
    count: 'receipt_count',
    table: 'copyright_territorial_notice_receipts',
    alias: 'fact',
    time: 'received_at',
  },
  {
    count: 'statement_of_reasons_count',
    table: 'copyright_territorial_decisions',
    alias: 'fact',
    time: 'decided_at',
  },
  {
    count: 'redress_request_count',
    table: 'copyright_territorial_redress_requests',
    alias: 'fact',
    time: 'received_at',
  },
  {
    count: 'redress_decision_count',
    table: 'copyright_territorial_redress_decisions',
    alias: 'request',
    time: 'decided_at',
  },
  {
    count: 'supervised_complaint_count',
    table: 'copyright_eu_supervised_complaints',
    alias: 'fact',
    time: 'received_at',
  },
  {
    count: 'escalation_count',
    table: 'copyright_territorial_escalations',
    alias: 'fact',
    time: 'escalated_at',
  },
] as const

export type EuCounts = Record<(typeof EU_REPORT_FACTS)[number]['count'], number>

export async function readEuCopyrightCounts(
  start: Date,
  end: Date,
  noticeIds?: readonly string[],
  query: QueryExecutor = read,
  generation?: { after: string | null; through: string },
): Promise<EuCounts> {
  const statement = sql`/* readEuCopyrightCounts */ SELECT `
  for (const [index, fact] of EU_REPORT_FACTS.entries()) {
    if (index) statement.append(', ')
    statement.append('(SELECT count(*)::integer FROM ').append(fact.table).append(' fact ')
    if (fact.alias === 'request') {
      statement.append(
        'JOIN copyright_territorial_redress_requests request ON request.id = fact.copyright_territorial_redress_request_id ',
      )
    }
    statement
      .append('WHERE ')
      .append(`${fact.alias}.jurisdiction`)
      .append(
        sql` = 'eu_dsa'
      AND `
          .append(`fact.${fact.time}`)
          .append(sql` >= ${start} AND `)
          .append(`fact.${fact.time}`)
          .append(sql` < ${end}`),
      )
    if (noticeIds)
      statement
        .append(' AND ')
        .append(`${fact.alias}.copyright_notice_id`)
        .append(sql` = ANY(${noticeIds}::uuid[])`)
    if (generation) {
      statement.append(sql` AND fact.transparency_generation <= ${generation.through}`)
      if (generation.after !== null)
        statement.append(sql` AND fact.transparency_generation > ${generation.after}`)
    }
    statement.append(') AS ').append(fact.count)
  }
  const { rows } = await query<EuCounts>(statement)
  assert(rows[0], 500, 'Failed to count EU copyright facts')
  return rows[0]
}
