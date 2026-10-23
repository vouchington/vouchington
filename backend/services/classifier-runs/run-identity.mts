import type { OwnedTransaction } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ClassifierRunSubject } from './types.mts'

/** Reserve the durable dedup key before creating its expiring payload. */
export async function claimClassifierRunIdentity(
  query: OwnedTransaction,
  slug: string,
  subject: ClassifierRunSubject,
  inputSha256: Buffer,
  configurationSha256: Buffer,
): Promise<{ id: string; isNew: boolean }> {
  const conflict: SQLStatement =
    subject.postId !== null
      ? sql`(classifier_id, post_id, input_sha256, configuration_sha256) WHERE post_id IS NOT NULL`
      : sql`(classifier_id, rss_feed_item_id, input_sha256, configuration_sha256)
        WHERE rss_feed_item_id IS NOT NULL`
  const { rows: inserted } = await query<{ id: string }>(
    sql`/* claimClassifierRunIdentity */
    INSERT INTO classifier_run_identities (
      classifier_id, post_id, rss_feed_item_id, input_sha256, configuration_sha256
    ) VALUES (
      (SELECT id FROM classifiers WHERE slug = ${slug}), ${subject.postId}, ${subject.rssFeedItemId},
      ${inputSha256}, ${configurationSha256}
    ) ON CONFLICT `
      .append(conflict)
      .append(' DO NOTHING RETURNING id'),
  )
  const created = inserted[0]
  if (created) return { id: created.id, isNew: true }
  const subjectMatch =
    subject.postId !== null
      ? sql`post_id = ${subject.postId}`
      : sql`rss_feed_item_id = ${subject.rssFeedItemId}`
  const { rows } = await query<{ id: string }>(
    sql`/* claimClassifierRunIdentity:existing */
    SELECT id FROM classifier_run_identities
    WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = ${slug})
      AND input_sha256 = ${inputSha256}
      AND configuration_sha256 = ${configurationSha256}
      AND `.append(subjectMatch),
  )
  const existing = rows[0]
  if (!existing) throw new Error('classifier run identity was not reserved')
  return { id: existing.id, isNew: false }
}
