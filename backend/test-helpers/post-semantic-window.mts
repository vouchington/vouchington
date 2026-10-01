import { randomBytes } from 'node:crypto'
import sql, { type SQLStatement } from 'sql-template-strings'
import { executePostSearchQuery } from '../services/posts/search/execute-query.mts'
import { beginTransaction } from '@data-stores/psql'

/** Random direction keeps persistent ANN fixtures apart without duplicate vectors. */
export function createSemanticWindowEmbedding(): number[] {
  const coordinates = [...randomBytes(32)].map(value => value / 255 - 0.5)
  const magnitude = Math.hypot(...coordinates)
  return [...coordinates.map(value => value / magnitude), ...Array<number>(992).fill(0)]
}

/** Ownership-scoped embedded rows for candidate caps and selective post-filter tests. */
export async function insertSemanticWindowPosts(
  userId: string,
  count: number,
  embedding: number[],
): Promise<string[]> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* insertSemanticWindowPosts */
    INSERT INTO posts (
      post_type, title, markdown, created_by_id, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256,
      bedrock_nova_multimodal_v1_embedding
    )
    SELECT 'discussion', 'Semantic window fixture', 'Semantic window fixture', ${userId}::uuid,
      'system', decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex'),
      (${embedding.slice(0, 32)}::real[] || ARRAY[ordinal::real / ${count}::real]
        || array_fill(0::real, ARRAY[991]))::vector(1024)
    FROM generate_series(1, ${count}::integer) AS ordinal
    RETURNING id
  `)
  const ids = rows.map(row => row.id)
  await transaction(sql`/* insertSemanticWindowPosts */
    WITH changes AS (
      INSERT INTO post_clearance_changes (post_id, change_type, metadata)
      SELECT id, 'approve', '{"source":"semantic-window-test"}'::jsonb
      FROM posts WHERE id = ANY(${ids}::uuid[])
      RETURNING id, post_id, created_at
    )
    UPDATE posts SET latest_clearance_change_id = changes.id, approved_at = changes.created_at
    FROM changes WHERE posts.id = changes.post_id
  `)
  await transaction.commit()
  return ids
}

type PlanNode = {
  'Node Type': string
  'Subplan Name'?: string
  Alias?: string
  'Index Name'?: string
  'Index Cond'?: string
  'Startup Cost': number
  'Total Cost': number
  'Actual Rows': number
  Plans?: PlanNode[]
}

/** Exercise the exact production settings and report scoped candidate work in CI. */
export async function explainSemanticWindow(query: SQLStatement) {
  const { rows } = await executePostSearchQuery(
    sql`EXPLAIN (ANALYZE, FORMAT JSON) `.append(query),
    true,
  )
  const [{ Plan: root, 'Execution Time': executionTime }] = rows[0]['QUERY PLAN'] as {
    Plan: PlanNode
    'Execution Time': number
  }[]
  const nodes: PlanNode[] = []
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()!
    nodes.push(node)
    pending.push(...(node.Plans ?? []))
  }
  const candidate = nodes.find(node => node['Subplan Name'] === 'CTE semantic_post_candidates')!
  const driving = nodes.find(node => node.Alias === 'semantic_vector_post')!
  console.info('selective semantic window plan', {
    executionTime,
    outputRows: root['Actual Rows'],
    candidateRows: candidate['Actual Rows'],
    drivingNode: driving['Node Type'],
    drivingIndex: driving['Index Name'],
    drivingIndexCondition: driving['Index Cond'],
    drivingRows: driving['Actual Rows'],
    candidateStartupCost: candidate['Startup Cost'],
    candidateTotalCost: candidate['Total Cost'],
  })
  return { candidateRows: candidate['Actual Rows'], outputRows: root['Actual Rows'] }
}
