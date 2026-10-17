import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

/** Communities without list items prove listed search skips unrelated rows as the table grows. */
export async function seedNonListCommunities(count = 20_000): Promise<void> {
  console.log(`Seeding ${count} non-list communities for search plans...`)
  const createdById = seedUuid(0, '01')
  const ids: string[] = []
  const names: string[] = []
  const slugs: string[] = []
  for (let index = 0; index < count; index++) {
    ids.push(seedUuid(index + 10_000, '14'))
    names.push(`Noise Community ${index}`)
    slugs.push(`noise-community-${index}`)
  }
  await write(
    `/* seedExplainData */ INSERT INTO communities (id, name, slug, created_by_id, created_via)
     SELECT id, name, slug, $4, 'system' FROM unnest($1::uuid[], $2::text[], $3::text[])
       AS noise(id, name, slug)
     ON CONFLICT DO NOTHING`,
    [ids, names, slugs, createdById],
  )
}
