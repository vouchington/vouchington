import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUuid } from './common.mts'

/** Representative vector corpus: about five percent of 40k rows match the query threshold. */
export async function seedSemanticPosts(): Promise<void> {
  for (let start = 0; start < 40_000; start += 1000) {
    const ids = Array.from({ length: 1000 }, (_, index) => seedUuid(start + index, '05'))
    await write(sql`/* seedSemanticPosts */
      UPDATE posts
      SET bedrock_nova_multimodal_v1_embedding = (
        ARRAY[CASE WHEN seed.ordinal % 20 = 0 THEN 1::real ELSE 0::real END,
          1::real + (${start} + seed.ordinal)::real / 100000]
        || array_fill(0::real, ARRAY[1022])
      )::vector(1024)
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS seed(id, ordinal)
      WHERE posts.id = seed.id
    `)
  }
}
