import { write } from '@data-stores/psql'

/** Probe each current inventory entry against the owned source, including alias pointers. */
export async function getTopicMergeLiveSourceReferences(
  sourceId: string,
  inventory: Readonly<Record<string, string>>,
) {
  const references = Object.entries(inventory).filter(
    ([, group]) => group !== 'history' && group !== 'derived',
  )
  const entries = references.map(([reference, group]) => {
    const parts = reference.split('.')
    if (parts.length !== 2 || parts.some(part => !/^[a-z][a-z0-9_]*$/.test(part)))
      throw new Error(`Invalid topic merge reference: ${reference}`)
    return { reference, group, table: parts[0]!, column: parts[1]! }
  })
  // Lifecycle columns are discovered per table so newly inventoried tables get the same treatment.
  const { rows } = await write<{ table_name: string; column_name: string }>(
    `/* getTopicMergeLiveSourceReferences lifecycle columns */
      SELECT relation.relname AS table_name, attribute.attname AS column_name
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
        AND attribute.attname = ANY($2::text[]) AND NOT attribute.attisdropped`,
    [
      [...new Set(entries.map(entry => entry.table))],
      ['deleted_at', 'removed_at', 'rejected_at', 'revoked_at'],
    ],
  )
  const results = []
  for (const { reference, group, table, column } of entries) {
    const predicates: string[] = []
    for (const row of rows) {
      if (row.table_name === table) predicates.push(`"${row.column_name}" IS NULL`)
    }
    const { rows: matches } = await write<{ present: boolean }>(
      `/* getTopicMergeLiveSourceReferences */ SELECT TRUE AS present FROM public."${table}"
       WHERE "${column}" = $1::uuid ${predicates.map(predicate => `AND ${predicate}`).join(' ')} LIMIT 1`,
      [sourceId],
    )
    results.push({ reference, group, hasSourceReference: matches.length > 0 })
  }
  return results
}
