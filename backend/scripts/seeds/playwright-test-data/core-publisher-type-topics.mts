import type { TransactionQuery } from '@data-stores/psql'

// Publisher-type topics are seeded with deterministic UUIDv7 IDs so the
// publisher_type tag Select (data-pw="publisher-type-select") and its options
// (data-pw="publisher-type-option-<slug>") are reachable in Playwright tests.
const ZERO_EMBEDDING = `decode('${'0'.repeat(64)}', 'hex')`

export async function seedPlaywrightPublisherTypeTopics(query: TransactionQuery): Promise<void> {
  await query(
    `INSERT INTO topics (id, topic_type, name, slug, markdown, bedrock_nova_multimodal_v1_content_sha256, created_via) VALUES
      ('019c64e6-f700-7001-a000-000000000001','topic','Mainstream Media','mainstream-media','',${ZERO_EMBEDDING}, 'system'),
      ('019c64e6-f700-7008-a000-000000000008','topic','Public Media','public-media','',${ZERO_EMBEDDING}, 'system'),
      ('019c64e6-f700-7002-a000-000000000002','topic','Corporate Media','corporate-media','',${ZERO_EMBEDDING}, 'system'),
      ('019c64e6-f700-7003-a000-000000000003','topic','Blog','blog','',${ZERO_EMBEDDING}, 'system'),
      ('019c64e6-f700-7004-a000-000000000004','topic','Aggregator','aggregator','',${ZERO_EMBEDDING}, 'system'),
      ('019c64e6-f700-7005-a000-000000000005','topic','Forum','forum','',${ZERO_EMBEDDING}, 'system'),
      ('019c64e6-f700-7006-a000-000000000006','topic','UGC Platform','ugc-platform','',${ZERO_EMBEDDING}, 'system'),
      ('019c64e6-f700-7007-a000-000000000007','topic','Review','review','',${ZERO_EMBEDDING}, 'system')
    ON CONFLICT (slug) DO UPDATE
      SET topic_type = EXCLUDED.topic_type,
          name = EXCLUDED.name,
          markdown = EXCLUDED.markdown,
          bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256`,
  )
}
