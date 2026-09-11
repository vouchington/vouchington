import { readFileSync } from 'node:fs'
import {
  createTestUser,
  getTestPostPublicationShadowAuditCheckpoint,
  insertTestPost,
  setTestPostPublicationShadowAuditCheckpoint,
} from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { runPostPublicationShadowAudit } from './shadow-audit.mts'

const shadowAuditSource = readFileSync(new URL('./shadow-audit.mts', import.meta.url), 'utf8')

describe('post publication shadow audit checkpoints', () => {
  it('bounds both indexed audit sources before union materialization', () => {
    expect(shadowAuditSource).toContain(
      'SELECT id FROM (SELECT id FROM posts WHERE (${checkpoint}::uuid IS NULL OR id > ${checkpoint}::uuid) ORDER BY id LIMIT ${limit}) post_ids',
    )
    expect(shadowAuditSource).toContain(
      'SELECT post_id AS id FROM (SELECT post_id FROM post_publication_projection_receipts WHERE (${checkpoint}::uuid IS NULL OR post_id > ${checkpoint}::uuid) ORDER BY post_id LIMIT ${limit}) receipt_ids',
    )
  })

  it('resets the durable checkpoint after the final partial repair page', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected final-page checkpoint user fixture')
    const suffix = randomUUID().replaceAll('-', '').slice(0, 11)
    const idPrefix = `ffffffff-ffff-7fff-bfff-${suffix}`
    const cursor = `${idPrefix}0`
    const firstPostId = `${idPrefix}1`
    const secondPostId = `${idPrefix}2`
    const checkpointName = `post-publication-shadow-partial-${randomUUID()}`
    await insertTestPost({
      id: firstPostId,
      title: `Final partial audit page ${suffix} first`,
      slug: `final-partial-audit-${suffix}-first`,
      markdown: 'First row on a terminal audit page.',
      createdById: user.id,
    })
    await insertTestPost({
      id: secondPostId,
      title: `Final partial audit page ${suffix} second`,
      slug: `final-partial-audit-${suffix}-second`,
      markdown: 'Second row on a terminal audit page.',
      createdById: user.id,
    })
    await setTestPostPublicationShadowAuditCheckpoint(checkpointName, cursor)

    const result = await runPostPublicationShadowAudit({
      dryRun: false,
      limit: 100,
      checkpointName,
    })

    expect(result).toMatchObject({
      hasMore: false,
    })
    expect(result.scannedByScope.post).toBeGreaterThanOrEqual(2)
    await expect(getTestPostPublicationShadowAuditCheckpoint(checkpointName)).resolves.toBeNull()
  })
})
