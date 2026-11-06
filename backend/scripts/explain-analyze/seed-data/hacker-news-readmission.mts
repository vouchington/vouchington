import { write } from '@data-stores/psql'
import type { buildHackerNewsReadmissionPageQuery } from '@services/urls/hacker-news-lookup-readmission'
type LookupReadmissionWindow = Parameters<typeof buildHackerNewsReadmissionPageQuery>[0]
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

export const READMISSION_FIXTURE_ROWS = 20_000
const HOSTNAME_ID = seedUuid(620_000, '02')

/** Most lookup facts are fresh; only a small leading timestamp range can need work. */
export async function seedHackerNewsReadmissionFixture(
  window: LookupReadmissionWindow,
  candidates: number,
) {
  await cleanupHackerNewsReadmissionFixture()
  const prefix = seedUuidAtTimestamp(window.decisionInstant - 86_400_000, 0).slice(0, 24)
  const lookedUpAt = new Date(Date.parse(window.cutoff) - 3_600_000).toISOString()
  await write(
    `/* seedHackerNewsReadmissionFixture:hostname */
    INSERT INTO url_hostnames(id,hostname) VALUES($1,'hn-readmission-plan.example.com')
    ON CONFLICT DO NOTHING`,
    [HOSTNAME_ID],
  )
  await write(
    `/* seedHackerNewsReadmissionFixture:urls */
    INSERT INTO urls(id,url,hostname_id,search_params)
    SELECT ($3::text||lpad(to_hex(i),12,'0'))::uuid,
      'https://hn-readmission-plan.example.com/article/'||i,$2,'{}'::jsonb
    FROM generate_series(600000,600000+$1::int-1)i
    ON CONFLICT DO NOTHING`,
    [READMISSION_FIXTURE_ROWS, HOSTNAME_ID, prefix],
  )
  const lastCandidateId = `${prefix}${(600_000 + candidates - 1).toString(16).padStart(12, '0')}`
  await write(
    `/* seedHackerNewsReadmissionFixture:totals */
    INSERT INTO url_hacker_news_totals(url_id,story_count,comment_count,looked_up_at)
    SELECT id,0,0,CASE WHEN id<=$2::uuid THEN $3::timestamptz ELSE $4::timestamptz END
    FROM urls WHERE hostname_id=$1 LIMIT $5
    ON CONFLICT(url_id) DO UPDATE SET looked_up_at=EXCLUDED.looked_up_at`,
    [
      HOSTNAME_ID,
      lastCandidateId,
      lookedUpAt,
      new Date(window.decisionInstant).toISOString(),
      READMISSION_FIXTURE_ROWS,
    ],
  )
  await write(
    '/* analyzeHackerNewsReadmissionFixture */ ANALYZE url_hacker_news_totals,urls,url_hostnames',
  )
  const { rows } = await write<{ total: string; candidates: string }>(
    `/* countHackerNewsReadmissionFixture */ SELECT count(*)::text AS total,
      count(*) FILTER(WHERE looked_up_at <= $1::timestamptz)::text AS candidates
    FROM url_hacker_news_totals`,
    [window.cutoff],
  )
  return {
    last: { lookedUpAt, urlId: lastCandidateId },
    middle: {
      lookedUpAt,
      urlId: `${prefix}${(600_000 + Math.floor(candidates / 2) - 1).toString(16).padStart(12, '0')}`,
    },
    remaining: candidates - Math.floor(candidates / 2),
    density: rows[0]!,
  }
}

export async function cleanupHackerNewsReadmissionFixture(): Promise<void> {
  await write(
    `/* cleanupHackerNewsReadmissionFixture:urls */
    WITH owned AS (SELECT id FROM urls WHERE hostname_id=$1 LIMIT $2)
    DELETE FROM urls USING owned WHERE urls.id=owned.id`,
    [HOSTNAME_ID, READMISSION_FIXTURE_ROWS],
  )
  await write(
    '/* cleanupHackerNewsReadmissionFixture:hostname */ DELETE FROM url_hostnames WHERE id=$1',
    [HOSTNAME_ID],
  )
}
