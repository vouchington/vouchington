import { read } from '@data-stores/psql'
import type { TopicRevision } from '../../services/topic-revisions/index.mts'

type RevisionRow = {
  id: string
  topic_id: string
  revision_type: TopicRevision['revision_type']
  revised_by_id: string | null
  revised_by_roles: string[]
  created_at: Date
  alias_change_kind: string | null
}

type AliasRow = {
  revision_id: string
  side: 'before' | 'after'
  alias_text: string
}

export async function getTopicRevisionsForTest(topicId: string): Promise<TopicRevision[]> {
  const { rows } = await read<RevisionRow>(
    `/* getTopicRevisionsForTest */
      SELECT id, topic_id, revision_type, revised_by_id, revised_by_roles, created_at,
        alias_change_kind
      FROM topic_revisions
      WHERE topic_id = $1
      ORDER BY id`,
    [topicId],
  )
  if (rows.length === 0) return []
  const { rows: aliases } = await read<AliasRow>(
    `/* getTopicRevisionsForTest.aliases */
      SELECT revision_id, side, alias_text
      FROM topic_revision_alias_entries
      WHERE revision_id = ANY($1::uuid[])
      ORDER BY revision_id, side, position`,
    [rows.map(row => row.id)],
  )
  const aliasesByRevision = new Map<string, AliasRow[]>()
  for (const alias of aliases) {
    const entries = aliasesByRevision.get(alias.revision_id) ?? []
    entries.push(alias)
    aliasesByRevision.set(alias.revision_id, entries)
  }
  return rows.map(row => ({
    id: row.id,
    topic_id: row.topic_id,
    revision_type: row.revision_type,
    revised_by_id: row.revised_by_id,
    revised_by_roles: row.revised_by_roles,
    created_at: row.created_at,
    changes: aliasRevisionChanges(row.alias_change_kind, aliasesByRevision.get(row.id) ?? []),
  }))
}

function aliasRevisionChanges(kind: string | null, entries: AliasRow[]): TopicRevision['changes'] {
  if (kind !== 'topic_aliases') return {}
  const before: string[] = []
  const after: string[] = []
  for (const entry of entries) {
    if (entry.side === 'before') before.push(entry.alias_text)
    else after.push(entry.alias_text)
  }
  return { topic_aliases: { before, after } }
}
