import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { contentHash, seedUuidAtTimestamp } from './common.mts'

const NOISE = 600
// Older than the EXPLAIN corpus, so this global cursor sees the owned fixture first.
const FIXTURE_INSTANT = Date.UTC(2015, 3, 15)
const ID_BASE = 723_000

export function postEmbeddingBanEvasionFixture(pendingCount: number) {
  const tag = `explain-ban-evasion-${randomUUID()}`
  const fixtureId = (index: number) => seedUuidAtTimestamp(FIXTURE_INSTANT, ID_BASE + index)
  const communityId = fixtureId(0)
  const authorCount = Math.ceil(pendingCount / 2)
  const users = Array.from({ length: authorCount + 1 }, (_, i) => fixtureId(1 + i))
  const sharedAuthor = users.at(-1)!
  const anchorId = fixtureId(1_000)
  const pendingIds = Array.from({ length: pendingCount }, (_, i) => fixtureId(2_000 + i * 4))
  const noiseIds = Array.from({ length: NOISE }, (_, i) => fixtureId(2_001 + i + Math.floor(i / 3)))
  const hash = contentHash(tag)
  const markedNoiseIds = noiseIds.filter((_, i) => i % 3 === 0)
  const firstPosts = pendingIds.flatMap((postId, i) =>
    i % 2 === 0 ? [{ postId, userId: users[i / 2]!, communityId }] : [],
  )
  const allPostIds = [anchorId, ...pendingIds, ...noiseIds]
  return {
    communityId,
    pendingIds,
    firstPosts,
    allPostIds,
    markedNoiseIds,
    hashHex: hash.toString('hex'),
    sharedHashRows: pendingIds.length + 2 * markedNoiseIds.length,
    async seed() {
      await write(
        `/* seedPostEmbeddingRecoveryUsers */
        INSERT INTO users(id,username) SELECT id,$2 || '-' || n
        FROM unnest($1::uuid[]) WITH ORDINALITY users(id,n)`,
        [users, tag],
      )
      await write(
        `/* seedPostEmbeddingRecoveryCommunity */
        INSERT INTO communities (id,name,slug,created_by_id,created_via)
        VALUES ($1,$2,$2,$3,'system')`,
        [communityId, tag, sharedAuthor],
      )
      await write(
        `/* seedPostEmbeddingRecoveryPosts */
        INSERT INTO posts (id,created_by_id,community_id,post_type,created_via,title,markdown,deleted_at,
          bedrock_nova_multimodal_v1_content_sha256,llm_moderation_content_sha256,
          bedrock_nova_multimodal_v1_input_sha256,bedrock_nova_multimodal_v1_embedding,
          bedrock_nova_multimodal_v1_embedding_created_at,ban_evasion_post_embedding_input_sha256)
        SELECT input.id,input.owner,$3,'discussion','system','Embedding recovery fixture','Embedding recovery fixture',
          CASE WHEN input.kind='deleted' THEN CURRENT_TIMESTAMP END,$4,$4,
          CASE WHEN input.kind='stale' THEN $5::bytea WHEN input.kind<>'anchor' THEN $4::bytea END,
          CASE WHEN input.kind<>'anchor' THEN ('[' || repeat('0,',1023) || '1]')::vector END,
          CASE WHEN input.kind<>'anchor' THEN CURRENT_TIMESTAMP END,
          CASE WHEN input.kind='marked' THEN $4::bytea END
        FROM unnest($1::uuid[],$2::uuid[],$6::text[]) input(id,owner,kind)`,
        [
          allPostIds,
          [
            sharedAuthor,
            ...pendingIds.map((_, i) => (i % 2 === 0 ? users[i / 2]! : sharedAuthor)),
            ...noiseIds.map(() => sharedAuthor),
          ],
          communityId,
          hash,
          contentHash(`${tag}-stale`),
          [
            'anchor',
            ...pendingIds.map(() => 'pending'),
            ...noiseIds.map((_, i) => ['marked', 'stale', 'deleted'][i % 3]!),
          ],
        ],
      )
    },
    async cleanup() {
      await write(
        '/* cleanupPostEmbeddingRecoveryPosts */ DELETE FROM posts WHERE id=ANY($1::uuid[])',
        [allPostIds],
      )
      await write(
        '/* cleanupPostEmbeddingRecoveryCommunity */ DELETE FROM communities WHERE id=$1',
        [communityId],
      )
      await write(
        '/* cleanupPostEmbeddingRecoveryUsers */ DELETE FROM users WHERE id=ANY($1::uuid[])',
        [users],
      )
    },
  }
}
