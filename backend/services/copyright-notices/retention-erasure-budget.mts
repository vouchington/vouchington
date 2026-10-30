import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

type WorkFamily = 'keys' | 'objects' | 'cases'

/** Low budgets rotate work families durably; maintenance never permanently consumes every page. */
export async function planCopyrightRetentionPages(
  budget: number,
  caseCap: number,
  casesEnabled: boolean,
) {
  if (!Number.isSafeInteger(budget) || budget < 1 || !Number.isSafeInteger(caseCap) || caseCap < 1)
    throw new RangeError('Invalid copyright retention work page budget')
  const families: WorkFamily[] = casesEnabled ? ['keys', 'objects', 'cases'] : ['keys', 'objects']
  if (budget >= families.length)
    return { keys: true, objects: true, cases: casesEnabled ? Math.min(caseCap, budget - 2) : 0 }
  await using query = await beginTransaction()
  await query(sql`/* ensureCopyrightRetentionPageTurn */ INSERT INTO copyright_notice_minimal_purge_cursors (family)
    VALUES ('evidence') ON CONFLICT DO NOTHING`)
  const { rows } = await query<{ work_page_turn: number }>(sql`/* lockCopyrightRetentionPageTurn */
    SELECT work_page_turn FROM copyright_notice_minimal_purge_cursors WHERE family = 'evidence' FOR UPDATE`)
  const turn = (rows[0]?.work_page_turn ?? 0) % families.length
  const selected = Array.from(
    { length: budget },
    (_, offset) => families[(turn + offset) % families.length],
  )
  await query(sql`/* checkpointCopyrightRetentionPageTurn */ UPDATE copyright_notice_minimal_purge_cursors
    SET work_page_turn = ${(turn + budget) % families.length} WHERE family = 'evidence'`)
  await query.commit()
  return {
    keys: selected.includes('keys'),
    objects: selected.includes('objects'),
    cases: selected.includes('cases') ? 1 : 0,
  }
}
