import { v7 } from 'uuid'
import { write } from '@data-stores/psql'

/** Creates immutable revision clocks at insertion, including two revisions at the same instant. */
export async function insertTestReconciliationRevisionClocks(
  postId: string,
  actorId: string,
  msecs: number,
) {
  const ids = [0, 1].map(seq => v7({ msecs, seq }))
  await write(
    `/* insertTestReconciliationRevisionClocks */
    INSERT INTO post_revisions (id, post_id, revision_type, revised_by_id, changes)
    SELECT id, $2::uuid, 'update', $3::uuid, '{"markdown":{"before":"old","after":"new"}}'::jsonb
    FROM unnest($1::uuid[]) id ORDER BY id`,
    [ids, postId, actorId],
  )
  const { rows } = await write<{ id: string; epoch_us: string }>(
    `/* getTestReconciliationRevisionClocks */
    SELECT id, floor(extract(epoch FROM created_at) * 1000000)::text AS epoch_us
    FROM post_revisions WHERE id = ANY($1::uuid[]) ORDER BY created_at, id`,
    [ids],
  )
  return rows
}

/** Inserts precise mutable-row clocks without bypassing update triggers or immutable history. */
export async function insertTestReconciliationUrlClocks(
  hostnameId: string,
  actorId: string,
  msecs: number,
) {
  const ids = [v7({ msecs, seq: 0 }), v7({ msecs, seq: 1 }), v7({ msecs: msecs - 1 })]
  const base = new Date(msecs).toISOString().replace('Z', '')
  const timestamps = [`${base}000Z`, `${base}000Z`, `${base}001Z`]
  const { rows } = await write<{ id: string; epoch_us: string }>(
    `/* insertTestReconciliationUrlClocks */
    INSERT INTO urls (id, url, hostname_id, pathname, search_params, created_by_id, updated_at)
    SELECT id, 'https://precise.example.com/' || id::text, $3::uuid, '/' || id::text, '{}'::jsonb, $4::uuid, updated_at
    FROM unnest($1::uuid[], $2::timestamptz[]) fixture(id, updated_at) ORDER BY id
    RETURNING id, floor(extract(epoch FROM updated_at) * 1000000)::text AS epoch_us`,
    [ids, timestamps, hostnameId, actorId],
  )
  return rows.toSorted(
    (a, b) => Number(BigInt(a.epoch_us) - BigInt(b.epoch_us)) || a.id.localeCompare(b.id),
  )
}
