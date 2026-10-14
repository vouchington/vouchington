import type { TransactionQuery } from '@data-stores/psql/types'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import createError from 'http-errors'
import sql from 'sql-template-strings'

export type CopyrightEmailThreadGraph = {
  intakeIds: string[]
  descendantIntakeIds: string[]
  edges: string[]
  observedRows: number
  overflow: boolean
}

type CopyrightEmailGraphTokens = { digests: string[]; overflow: boolean }

/** Read the graph's reference and matched-link tokens before taking intake locks. */
export async function readCopyrightEmailGraphTokens(
  transaction: TransactionQuery,
  intakeIds: readonly string[],
  maxRows: number,
): Promise<CopyrightEmailGraphTokens> {
  const { rows: references } = await transaction<{ lookup_digest: string }>(sql`
    /* readCopyrightEmailGraphTokens:references */
    SELECT token.lookup_digest
    FROM unnest(${[...intakeIds].toSorted()}::uuid[]) graph_intake(id)
    JOIN LATERAL (
      SELECT reference.token_id
      FROM copyright_notice_email_thread_references reference
      WHERE reference.copyright_notice_email_intake_id = graph_intake.id
        AND reference.token_id IS NOT NULL
      ORDER BY reference.token_id, reference.reference_kind
      LIMIT ${maxRows + 1}
    ) reference ON true
    JOIN copyright_notice_email_thread_tokens token ON token.id = reference.token_id
    LIMIT ${maxRows + 1}
  `)
  if (references.length > maxRows) return { digests: [], overflow: true }
  const { rows: matches } = await transaction<{ lookup_digest: string }>(sql`
    /* readCopyrightEmailGraphTokens:matchedLinks */
    SELECT token.lookup_digest
    FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notice_email_thread_tokens token ON token.id = link.matched_token_id
    WHERE link.copyright_notice_email_intake_id = ANY(${[...intakeIds]}::uuid[])
    ORDER BY link.copyright_notice_email_intake_id
    LIMIT ${maxRows + 1}
  `)
  return {
    digests: [...new Set([...references, ...matches].map(row => row.lookup_digest))].toSorted(),
    overflow: matches.length > maxRows,
  }
}

/** Read at most maxRows + 1 edge identities, then count distinct intakes and edges. */
export async function readCopyrightEmailThreadGraph(
  transaction: TransactionQuery,
  rootId: string,
  maxRows: number,
): Promise<CopyrightEmailThreadGraph> {
  const intakeIds = new Set([rootId])
  const descendants = new Set([rootId])
  const edges = new Set<string>()
  // The outer LIMIT consumes the recursive CTE incrementally. No aggregate or sort may sit
  // between it and the CTE: otherwise an over-cap graph could still be fully traversed.
  const { rows: outgoing } = await transaction<{ reply_id: string; ancestor_id: string }>(sql`
    /* readCopyrightEmailThreadGraph:outgoing */
    WITH RECURSIVE reached(reply_id, ancestor_id) AS (
      SELECT ${rootId}::uuid, ${rootId}::uuid
      UNION
      SELECT edge.reply_message_intake_id, edge.ancestor_message_intake_id
      FROM reached parent
      JOIN LATERAL (
        SELECT reply_message_intake_id, ancestor_message_intake_id
        FROM copyright_notice_email_message_ancestors
        WHERE ancestor_message_intake_id = parent.reply_id
        ORDER BY reply_message_intake_id
        LIMIT ${maxRows + 1}
      ) edge ON true
    )
    SELECT reply_id, ancestor_id FROM reached LIMIT ${maxRows + 2}
  `)
  for (const row of outgoing) {
    if (row.reply_id === rootId && row.ancestor_id === rootId) continue
    edges.add(`${row.reply_id}:${row.ancestor_id}`)
    intakeIds.add(row.reply_id)
    intakeIds.add(row.ancestor_id)
    descendants.add(row.reply_id)
    if (intakeIds.size + edges.size > maxRows) return snapshot(true)
  }

  // A descendant may name an ancestor outside the root's descendant closure. The backfill checks
  // those parents for other notices, so count and lock them too before making any link decision.
  const { rows: incoming } = await transaction<{ reply_id: string; ancestor_id: string }>(sql`
    /* readCopyrightEmailThreadGraph:incoming */
    SELECT reply_message_intake_id AS reply_id, ancestor_message_intake_id AS ancestor_id
    FROM copyright_notice_email_message_ancestors
    WHERE reply_message_intake_id = ANY(${[...descendants]}::uuid[])
    ORDER BY reply_message_intake_id, ancestor_message_intake_id
    LIMIT ${maxRows + 1}
  `)
  for (const row of incoming) {
    edges.add(`${row.reply_id}:${row.ancestor_id}`)
    intakeIds.add(row.ancestor_id)
    if (intakeIds.size + edges.size > maxRows) return snapshot(true)
  }
  return snapshot(false)

  function snapshot(overflow: boolean): CopyrightEmailThreadGraph {
    return {
      intakeIds: [...intakeIds].toSorted(),
      descendantIntakeIds: [...descendants].toSorted(),
      edges: [...edges].toSorted(),
      observedRows: intakeIds.size + edges.size,
      overflow,
    }
  }
}

/** FOR UPDATE, unlike NO KEY UPDATE, fences FK inserts of new edges and thread links. */
export async function lockCopyrightEmailGraphIntakes(
  transaction: TransactionQuery,
  intakeIds: readonly string[],
): Promise<void> {
  const { rows } = await transaction<{ id: string }>(sql`
    /* lockCopyrightEmailGraphIntakes */
    SELECT id FROM copyright_notice_email_intakes
    WHERE id = ANY(${[...intakeIds].toSorted()}::uuid[])
    ORDER BY id FOR UPDATE
  `)
  if (rows.length !== intakeIds.length) throw copyrightEmailThreadChangedError()
}

export function assertCopyrightEmailGraphUnchanged(
  before: CopyrightEmailThreadGraph,
  after: CopyrightEmailThreadGraph,
): void {
  if (
    before.overflow !== after.overflow ||
    before.intakeIds.length !== after.intakeIds.length ||
    before.descendantIntakeIds.length !== after.descendantIntakeIds.length ||
    before.edges.length !== after.edges.length ||
    before.intakeIds.some((id, i) => id !== after.intakeIds[i]) ||
    before.descendantIntakeIds.some((id, i) => id !== after.descendantIntakeIds[i]) ||
    before.edges.some((edge, i) => edge !== after.edges[i])
  ) {
    throw copyrightEmailThreadChangedError()
  }
}

export function copyrightEmailThreadChangedError() {
  return Object.assign(createError(409, 'Copyright email thread changed; retry staff approval'), {
    code: COPYRIGHT_EMAIL_THREAD_CHANGED,
  })
}
