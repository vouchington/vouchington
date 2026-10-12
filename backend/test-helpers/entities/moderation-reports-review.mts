import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function reviewTestModerationReports(reportIds: string[]): Promise<void> {
  await write(sql`
    UPDATE moderation_reports
    SET resolution_action = 'reviewed', reviewed_at = NOW()
    WHERE id = ANY(${reportIds})
  `)
}

export async function reviewPendingTestModerationReportsByReporterUsernamePrefixes(
  prefixes: string[],
): Promise<void> {
  if (prefixes.length === 0) return

  await write(sql`
    UPDATE moderation_reports r
    SET resolution_action = 'reviewed', reviewed_at = NOW()
    FROM users u
    WHERE r.reporter_user_id = u.id
      AND r.reviewed_at IS NULL
      AND u.username LIKE ANY(${prefixes.map(prefix => `${prefix}%`)})
  `)
}

export async function reviewPendingTestModerationReportsByNotePrefixes(
  prefixes: string[],
): Promise<void> {
  if (prefixes.length === 0) return

  await write(sql`
    UPDATE moderation_reports
    SET resolution_action = 'reviewed', reviewed_at = NOW()
    WHERE reviewed_at IS NULL
      AND note LIKE ANY(${prefixes.map(prefix => `${prefix}%`)})
  `)
}

export async function reviewPendingTestModerationReportsByPostSlugPrefixes(
  prefixes: string[],
): Promise<void> {
  if (prefixes.length === 0) return

  await write(sql`
    UPDATE moderation_reports r
    SET resolution_action = 'reviewed', reviewed_at = NOW()
    FROM post_slugs ps
    WHERE r.post_id IS NOT NULL
      AND r.post_id = ps.post_id
      AND r.reviewed_at IS NULL
      AND ps.slug LIKE ANY(${prefixes.map(prefix => `${prefix}%`)})
  `)
}
