import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordLandingPageVisit as emitLandingPageVisit } from '@services/analytics'

export async function recordLandingPageVisit({
  landingPageId,
  sessionId,
  referrer,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
}: {
  landingPageId: string
  sessionId: string
  referrer?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
}): Promise<void> {
  const { rows } = await read(sql`/* recordLandingPageVisit */
    SELECT 1 FROM user_landing_pages WHERE id = ${landingPageId} LIMIT 1
  `)
  if (!rows.length) return
  emitLandingPageVisit({
    pageId: landingPageId,
    sessionId,
    referrer: referrer ?? undefined,
    utmSource: utmSource ?? undefined,
    utmMedium: utmMedium ?? undefined,
    utmCampaign: utmCampaign ?? undefined,
    utmContent: utmContent ?? undefined,
  })
}
