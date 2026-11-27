import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'

export function ownedCommunities(count: number) {
  const ids = Array.from({ length: count }, () => randomUUID())
  return {
    ids,
    async seed() {
      await write(
        `/* seedExplainOwnedCommunities */
        INSERT INTO communities (id, name, slug, created_by_id, created_via)
        SELECT id, 'EXPLAIN community fixture', 'explain-' || id, $2, 'system'
        FROM unnest($1::uuid[]) AS fixture(id)`,
        [ids, seedUser.id],
      )
    },
    async cleanup() {
      await write(
        '/* cleanupExplainOwnedCommunities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
        [ids],
      )
    },
  }
}
