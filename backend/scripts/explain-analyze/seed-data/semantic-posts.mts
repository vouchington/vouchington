import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

/** Representative vector corpus: about five percent of 40k rows match the query threshold. */
export async function seedSemanticPosts(): Promise<void> {
  for (let start = 0; start < 40_000; start += 1000) {
    const ids = Array.from({ length: 1000 }, (_, index) => seedUuid(start + index, '05'))
    await write(
      `/* seedSemanticPosts */
      UPDATE posts
      SET bedrock_nova_multimodal_v1_embedding = (
        ARRAY[CASE WHEN seed.ordinal % 20 = 0 THEN 1::real ELSE 0.15::real END,
          1::real + ($1 + seed.ordinal)::real / 100000]
        || ARRAY(
          SELECT (sin(($1 + seed.ordinal) * coordinate::double precision)
            * CASE WHEN seed.ordinal % 20 = 0 THEN 0.02 ELSE 1 END)::real
          FROM generate_series(1, 30) AS coordinate
        )
        || array_fill(0::real, ARRAY[992])
      )::vector(1024)
      FROM unnest($2::uuid[]) WITH ORDINALITY AS seed(id, ordinal)
      WHERE posts.id = seed.id
    `,
      [start, ids],
    )
  }
}
