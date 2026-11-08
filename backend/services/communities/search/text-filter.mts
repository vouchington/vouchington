import sql, { type SQLStatement } from 'sql-template-strings'

export function appendCommunityTextProbe(query: SQLStatement, search: string): void {
  // LIMIT 1 keeps the probe correlated. A bare WHERE or EXISTS is pulled up, and the generic
  // plan then reads every match through the GIN index before sorting. c stays the communities
  // row so ORDER BY c.id matches the driving index.
  query.append(sql` JOIN LATERAL (
    SELECT 1 FROM communities text_match
    WHERE text_match.id = c.id
      AND text_match.search_vector @@ websearch_to_tsquery('voucha_english', ${search})
    LIMIT 1
  ) text_match ON TRUE`)
}
