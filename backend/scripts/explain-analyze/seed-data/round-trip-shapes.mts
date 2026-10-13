import { beginTransaction, read } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightSubmissionPurpose } from '@services/copyright-notices/submissions'
import { upsertCopyrightStorageObjectId } from '@services/copyright-notices/storage-objects'
import { upsertMediaTypes } from '@services/urls/media-types'
import { createHash } from 'node:crypto'
import { seedUuid } from './common.mts'

export const BLOCKLISTED_DOMAIN_SEED_COUNT = 20_000
export const USER_AGENT_SEED_COUNT = 5_000

/** Domain-blocklist rows large enough that the policy batches must probe by key, not scan. */
export async function seedBlocklistedDomains(): Promise<void> {
  console.log(`Seeding ${BLOCKLISTED_DOMAIN_SEED_COUNT} blocklisted domains...`)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES ('url', 'seed-explain-url-blocklist', 'https://seed.example.com/blocklist.txt')
    ON CONFLICT (name) DO NOTHING`,
  )
  await transaction(
    `/* seedExplainData */ INSERT INTO url_hostnames (hostname, publicly_introduced_at)
    SELECT 'seed-blocked-' || n || '.example.net', CURRENT_TIMESTAMP
    FROM generate_series(0, $1::int - 1) AS n
    ON CONFLICT (hostname) DO UPDATE SET
      publicly_introduced_at = COALESCE(url_hostnames.publicly_introduced_at, EXCLUDED.publicly_introduced_at)
    WHERE url_hostnames.publicly_introduced_at IS NULL`,
    [BLOCKLISTED_DOMAIN_SEED_COUNT],
  )
  await transaction(
    `/* seedExplainData */ INSERT INTO blocklisted_domains (source_id, domain, url_hostname_id)
    SELECT source.id, hostname.hostname, hostname.id
    FROM domain_blocklist_sources source
    CROSS JOIN generate_series(0, $1::int - 1) AS n
    JOIN url_hostnames hostname ON hostname.hostname = 'seed-blocked-' || n || '.example.net'
    WHERE source.name = 'seed-explain-url-blocklist'
    ON CONFLICT DO NOTHING`,
    [BLOCKLISTED_DOMAIN_SEED_COUNT],
  )
  await transaction.commit()
}

/** The lookup the vote and session paths read first; sized so a miss would show as a scan. */
export async function seedUserAgentStrings(): Promise<void> {
  console.log(`Seeding ${USER_AGENT_SEED_COUNT} user agent strings...`)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO user_agent_strings (user_agent)
    SELECT 'seed-explain-agent/' || n FROM generate_series(0, $1::int - 1) AS n
    ON CONFLICT DO NOTHING`,
    [USER_AGENT_SEED_COUNT],
  )
  await transaction.commit()
}

/** Give the staff case batch a nonempty evidence branch over a real development-seed notice. */
export async function seedCopyrightStaffEvidence(): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* findExplainCopyrightNotice */ SELECT copyright_notice_id AS id
     FROM copyright_notice_form_intakes ORDER BY copyright_notice_id LIMIT 1`,
  )
  const noticeId = rows[0]?.id
  if (!noticeId) throw new Error('Seed the development copyright notice before EXPLAIN data')
  const submissionId = seedUuid(0, '1e')
  const mediaTypeId = await upsertMediaTypes('text/plain')
  if (!mediaTypeId) throw new Error('Unable to seed evidence media type')
  const evidenceBytes = Buffer.from('seed-explain-copyright-evidence')
  await using transaction = await beginTransaction()
  const storageObjectId = await upsertCopyrightStorageObjectId(
    'seed-explain-copyright-evidence',
    transaction,
  )
  await transaction(
    `/* seedExplainCopyrightEvidence:submission */ INSERT INTO copyright_notice_submissions
       (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
     VALUES ($1, $2, 'supplement', now(), 'staff', $3)
     ON CONFLICT (id) DO NOTHING`,
    [submissionId, noticeId, encryptSecret('{}', copyrightSubmissionPurpose(submissionId))],
  )
  await transaction(
    `/* seedExplainCopyrightEvidence:artifact */ INSERT INTO copyright_notice_evidence_artifacts
       (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (copyright_notice_submission_id, storage_object_id) DO NOTHING`,
    [
      submissionId,
      storageObjectId,
      createHash('sha256').update(evidenceBytes).digest(),
      mediaTypeId,
      evidenceBytes.length,
    ],
  )
  await transaction.commit()
}
