import { write } from '@data-stores/psql'
import { enqueueStaydownHash } from '@queues/images/enqueues'
import sql from 'sql-template-strings'
import { isCopyrightStaydownMatchingEnabled } from './config.mts'

/**
 * Largest Hamming distance, out of 64 dHash bits, at which two images count as near-duplicates.
 * 8 bits (12.5%) tolerates re-encoding, resizing and mild colour shifts while keeping unrelated
 * pictures far outside (their expected distance is about 32). A match only asks staff to look, so
 * the threshold favours precision over recall.
 */
export const copyrightStaydownMaxHammingDistance = 8

/** Queues near-duplicate matching for a newly created image. Does nothing while the switch is off. */
export async function enqueueCopyrightStaydownUploadMatch(imageId: string): Promise<void> {
  if (await isCopyrightStaydownMatchingEnabled()) await enqueueStaydownHash(imageId, 'upload')
}

/**
 * Records that an upload deduplicated to an image a moderator confirmed as infringing, for staff
 * review. The upload itself is untouched. Returns the number of new matches.
 */
export async function recordCopyrightStaydownExactMatch(input: {
  imageId: string
  uploadedById: string
}): Promise<number> {
  if (!(await isCopyrightStaydownMatchingEnabled())) return 0
  const { rowCount } = await write(sql`/* recordCopyrightStaydownExactMatch */
    INSERT INTO copyright_staydown_matches (
      copyright_staydown_entry_id, image_id, uploaded_by_id, match_kind, hamming_distance
    )
    SELECT entry.id, image.id, ${input.uploadedById}::uuid AS uploaded_by_id, 'exact', 0
    FROM images image
    JOIN copyright_staydown_entries entry ON entry.sha_256 = image.sha_256
    WHERE image.id = ${input.imageId} AND image.deleted_at IS NULL
    ORDER BY entry.id ASC NULLS LAST, image.id ASC NULLS LAST, uploaded_by_id ASC NULLS LAST
    ON CONFLICT (copyright_staydown_entry_id, image_id, uploaded_by_id) DO NOTHING
  `)
  return rowCount ?? 0
}

/**
 * Stores the perceptual hash of a registered image the first time it is computed. Returns whether
 * an entry was filled.
 */
export async function fillCopyrightStaydownEntryHash(input: {
  imageId: string
  perceptualHash: string
}): Promise<boolean> {
  if (!(await isCopyrightStaydownMatchingEnabled())) return false
  const { rowCount } = await write(sql`/* fillCopyrightStaydownEntryHash */
    UPDATE copyright_staydown_entries
    SET perceptual_hash = ${input.perceptualHash}::bit(64)
    WHERE image_id = ${input.imageId} AND perceptual_hash IS NULL
  `)
  return (rowCount ?? 0) > 0
}

/**
 * Records every registered image the new upload resembles within the documented distance, for
 * staff review. A registered image never matches itself. Returns the number of new matches.
 */
export async function recordCopyrightStaydownPerceptualMatches(input: {
  imageId: string
  perceptualHash: string
}): Promise<number> {
  if (!(await isCopyrightStaydownMatchingEnabled())) return 0
  const { rowCount } = await write(sql`/* recordCopyrightStaydownPerceptualMatches */
    INSERT INTO copyright_staydown_matches (
      copyright_staydown_entry_id, image_id, uploaded_by_id, match_kind, hamming_distance
    )
    SELECT entry.id, image.id, image.created_by_id, 'perceptual',
      bit_count(entry.perceptual_hash # ${input.perceptualHash}::bit(64))
    FROM images image
    JOIN copyright_staydown_entries entry ON entry.image_id <> image.id
    WHERE image.id = ${input.imageId} AND image.deleted_at IS NULL
      AND entry.perceptual_hash IS NOT NULL
      AND bit_count(entry.perceptual_hash # ${input.perceptualHash}::bit(64))
        <= ${copyrightStaydownMaxHammingDistance}
    ORDER BY entry.id ASC NULLS LAST, image.id ASC NULLS LAST, image.created_by_id ASC NULLS LAST
    ON CONFLICT (copyright_staydown_entry_id, image_id, uploaded_by_id) DO NOTHING
  `)
  return rowCount ?? 0
}
