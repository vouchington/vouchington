import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

type OriginalUrl = { id: string; url: string; hostname_id: string }
export type SafetyHostFixture = {
  originalUrls: OriginalUrl[]
  ownedHostnameIds: string[]
  sources: Array<{ url_id: string; url: string }>
}

/** The maximum active cohort spans distinct hosts, each with three registered parent suffixes. */
export async function seedStoryProjectionSafetyHosts(): Promise<SafetyHostFixture> {
  const urlIds = Array.from({ length: 10000 }, (_, index) => seedUuid(index + 100, 'f6'))
  const hostnames = Array.from(
    { length: 10000 },
    (_, index) => `h${index}.source-lock-budget.example.test`,
  )
  hostnames.push('source-lock-budget.example.test', 'example.test', 'test')
  await using query = await beginTransaction()
  const { rows: originalUrls } = await query<OriginalUrl>(
    `/* seedStoryProjectionSafetyHosts:originalUrls */
    SELECT id, url, hostname_id FROM urls WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [urlIds],
  )
  assert.equal(originalUrls.length, 10000)
  const { rows: inserted } = await query<{ id: string }>(
    `/* seedStoryProjectionSafetyHosts:hostnames */
    INSERT INTO url_hostnames (id, hostname)
    SELECT id, hostname FROM unnest($1::uuid[], $2::text[]) input(id, hostname)
    ON CONFLICT (hostname) DO NOTHING RETURNING id`,
    [hostnames.map((_, index) => seedUuid(index, 'f4')), hostnames],
  )
  await query(
    `/* seedStoryProjectionSafetyHosts:urls */
    UPDATE urls SET hostname_id = hostname.id,
      url = 'https://' || input.hostname || '/' || input.ordinal
    FROM unnest($1::uuid[], $2::text[]) WITH ORDINALITY input(id, hostname, ordinal)
    JOIN url_hostnames hostname ON hostname.hostname = input.hostname
    WHERE urls.id = input.id`,
    [urlIds, hostnames.slice(0, 10000)],
  )
  await query.commit()
  return {
    originalUrls,
    ownedHostnameIds: inserted.map(row => row.id),
    sources: urlIds.map((urlId, index) => ({
      url_id: urlId,
      url: `https://${hostnames[index]}/${index + 1}`,
    })),
  }
}

export async function cleanupStoryProjectionSafetyHosts(fixture: SafetyHostFixture): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* cleanupStoryProjectionSafetyHosts:urls */
    UPDATE urls SET url = input.url, hostname_id = input.hostname_id
    FROM unnest($1::uuid[], $2::text[], $3::uuid[]) input(id, url, hostname_id)
    WHERE urls.id = input.id`,
    [
      fixture.originalUrls.map(row => row.id),
      fixture.originalUrls.map(row => row.url),
      fixture.originalUrls.map(row => row.hostname_id),
    ],
  )
  await query(
    `/* cleanupStoryProjectionSafetyHosts:hostnames */
    DELETE FROM url_hostnames WHERE id = ANY($1::uuid[])`,
    [fixture.ownedHostnameIds],
  )
  await query.commit()
}
