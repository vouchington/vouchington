import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestStaydownEntry = {
  id: string
  copyright_restriction_id: string
  image_id: string
  sha_256: Buffer
  /** The 64-character bit string, or null until the perceptual hash is filled. */
  perceptual_hash: string | null
}

export type TestStaydownMatch = {
  id: string
  copyright_staydown_entry_id: string
  image_id: string
  uploaded_by_id: string
  match_kind: 'exact' | 'perceptual'
  hamming_distance: number
  reviewed_at: Date | null
  reviewed_by_id: string | null
}

/** Registry entries held for a case, one per confirmed restriction. */
export async function readCopyrightStaydownEntries(noticeId: string): Promise<TestStaydownEntry[]> {
  const { rows } = await read<TestStaydownEntry>(sql`/* readCopyrightStaydownEntries */
    SELECT entry.id, entry.copyright_restriction_id, entry.image_id, entry.sha_256,
      entry.perceptual_hash::text AS perceptual_hash
    FROM copyright_staydown_entries entry
    JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId}
    ORDER BY entry.id
  `)
  return rows
}

/** Matches recorded against a case's registry entries, reviewed or not. */
export async function readCopyrightStaydownMatches(noticeId: string): Promise<TestStaydownMatch[]> {
  const { rows } = await read<TestStaydownMatch>(sql`/* readCopyrightStaydownMatches */
    SELECT staydown_match.id, staydown_match.copyright_staydown_entry_id, staydown_match.image_id,
      staydown_match.uploaded_by_id, staydown_match.match_kind, staydown_match.hamming_distance,
      staydown_match.reviewed_at, staydown_match.reviewed_by_id
    FROM copyright_staydown_matches staydown_match
    JOIN copyright_staydown_entries entry ON entry.id = staydown_match.copyright_staydown_entry_id
    JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId}
    ORDER BY staydown_match.id
  `)
  return rows
}

/** Matches recorded for one uploaded image across every case. */
export async function readCopyrightStaydownMatchesForImage(
  imageId: string,
): Promise<TestStaydownMatch[]> {
  const { rows } = await read<TestStaydownMatch>(sql`/* readCopyrightStaydownMatchesForImage */
    SELECT id, copyright_staydown_entry_id, image_id, uploaded_by_id, match_kind, hamming_distance,
      reviewed_at, reviewed_by_id
    FROM copyright_staydown_matches
    WHERE image_id = ${imageId}
    ORDER BY id
  `)
  return rows
}
