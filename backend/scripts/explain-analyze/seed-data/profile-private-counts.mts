import { beginTransaction, write } from '@data-stores/psql'
import { PROFILE_COUNT_CAP_DEFAULT } from '@services/users/profile-count-cap'
import { contentHash, seedUuid } from './common.mts'

export const PRIVATE_COUNT_TARGETS = PROFILE_COUNT_CAP_DEFAULT * 2
export const PRIVATE_COUNT_AUTHOR_ID = seedUuid(9_543_300, '01')
const OWNER_COUNT = 6

/** A selective owner probe over more relations than its count cap. */
export async function seedProfilePrivateCounts(): Promise<void> {
  const owners = Array.from({ length: OWNER_COUNT }, (_, i) => seedUuid(9_543_300 + i, '01'))
  const topics = Array.from({ length: PRIVATE_COUNT_TARGETS * 10 }, (_, i) =>
    seedUuid(i < PRIVATE_COUNT_TARGETS ? 9_543_300 + i : 8_000_000 + i, '04'),
  )
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedPrivateCountOwners */ INSERT INTO users(id, username)
     SELECT id, 'seed-private-count-' || ordinal FROM UNNEST($1::uuid[]) WITH ORDINALITY fixture(id, ordinal)
     ON CONFLICT (id) DO NOTHING`,
    [owners],
  )
  await transaction(
    `/* seedPrivateCountTopics */ INSERT INTO topics(id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, 'Private count fixture ' || id::text, 'seed-private-count-' || id::text, 'system', $2
     FROM UNNEST($1::uuid[]) WITH ORDINALITY fixture(id, ordinal) ORDER BY id
     ON CONFLICT (id) DO NOTHING`,
    [topics, contentHash('private-count-fixture')],
  )
  for (const predicate of ['mute', 'follow'] as const) {
    await transaction(
      `/* seedPrivateCountRelations */ INSERT INTO relation__user__${predicate}__topic(subject_id, object_id, created_by_id)
       SELECT owner_id, topic_id, owner_id FROM UNNEST($1::uuid[]) owners(owner_id)
       CROSS JOIN UNNEST($2::uuid[]) targets(topic_id) ON CONFLICT DO NOTHING`,
      [owners, topics.slice(0, PRIVATE_COUNT_TARGETS)],
    )
  }
  await transaction.commit()
  await write(`/* analyzePrivateCountFixture */ ANALYZE users, topics,
    relation__user__mute__topic, relation__user__follow__topic`)
}
