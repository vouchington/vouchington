import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createDynamicConfigTestKey,
  createDynamicConfigForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dynamicConfigValkeyClient } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import {
  insertTestRetainedIdentityRoot,
  insertTestRetainedRelationIdentity,
} from '@voucha/test-helpers/entities/retained-identities'
import { seedTestRetainedMediaOrphan } from '@voucha/test-helpers/entities/retained-media'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupRetainedMediaBindings } from '../cleanup-retained-media-bindings.mts'
import { cleanupRetainedRelationIdentities } from '../cleanup-retained-relation-identities.mts'
import { cleanupExpiredOAuthAuthorizationServerArtifacts } from '../cleanup-oauth-authorization-server.mts'
import { runDataRetentionCleanup } from '../cleanup.mts'
import {
  DATA_RETENTION_MAX_VALUES,
  DEFAULT_DATA_RETENTION_CONFIG,
  dataRetentionConfig,
} from '../config.mts'

describe('data retention per-run caps', () => {
  it.each([1, 1_000])('cleans exact owned retained pages capped at %i', async pageSize => {
    const postId = randomUUID()
    const relationId = randomUUID()
    const imageId = randomUUID()
    const placementId = randomUUID()
    const relationTable = 'relation__post__category__topic'
    await insertTestRetainedIdentityRoot('post', postId)
    await insertTestRetainedRelationIdentity(relationTable, postId, relationId)
    await seedTestRetainedMediaOrphan({ imageId, placementId, bindingFamily: 'post' })
    const relationResult = await cleanupRetainedRelationIdentities(pageSize, {
      [relationTable]: [{ subjectId: postId, relationId }],
    })
    expect(relationResult).toEqual([{ relationTable, scanned: 1, deleted: 1, hasMore: false }])
    const mediaResult = await cleanupRetainedMediaBindings(pageSize, [placementId])
    expect(mediaResult).toEqual({ scanned: 1, deleted: 1, hasMore: false })
    // Root removal follows the actual deletion of these owned relation and media references.
    const rootResult = await cleanupRetainedIdentityRoots(pageSize, {
      post: [postId],
      image: [imageId],
    })
    expect(rootResult).toEqual([
      { family: 'post', scanned: 1, deleted: 1, hasMore: false },
      { family: 'image', scanned: 1, deleted: 1, hasMore: false },
    ])
  })

  it('loads persisted limits into a fresh config before its first read', async () => {
    const configOptions = {
      key: createDynamicConfigTestKey('retention-cold-start'),
      fieldTypes: dataRetentionConfig.fieldTypes,
      defaultFields: DEFAULT_DATA_RETENTION_CONFIG,
    }
    const writer = createDynamicConfigForTest(configOptions)
    try {
      await writer.waitForInitialization()
      await writer.setFields({ batch_size: 7, max_batches_per_run: 3 })
      const coldReader = createDynamicConfigForTest(configOptions)
      try {
        await coldReader.waitForInitialization()
        expect(
          getBoundedPositiveIntegerField(coldReader, 'batch_size', {
            defaultValue: configOptions.defaultFields.batch_size,
            maxValue: DATA_RETENTION_MAX_VALUES.batch_size,
          }),
        ).toBe(7)
        expect(
          getBoundedPositiveIntegerField(coldReader, 'max_batches_per_run', {
            defaultValue: configOptions.defaultFields.max_batches_per_run,
            maxValue: DATA_RETENTION_MAX_VALUES.max_batches_per_run,
          }),
        ).toBe(3)
      } finally {
        await coldReader.close()
      }
    } finally {
      await writer.close()
      await dynamicConfigValkeyClient.del([writer.key])
    }
  })

  it.each([
    [
      'soft-deleted users',
      (options: { maxBatches: number }) =>
        runDataRetentionCleanup(
          { batchSize: 500, maxBatches: 1 },
          { families: ['softDeletedUsers'], softDeletedUsers: options },
        ).then(result => result.softDeletedUsers),
    ],
    [
      'orphaned OAuth accounts',
      (options: { maxBatches: number }) =>
        runDataRetentionCleanup(
          { batchSize: 500, maxBatches: 1 },
          { families: ['orphanedOAuthAccounts'], orphanedOAuthAccounts: options },
        ).then(result => result.orphanedOAuthAccounts),
    ],
    ['OAuth server artifacts', cleanupExpiredOAuthAuthorizationServerArtifacts],
  ])('rejects an uncapped or invalid maxBatches for %s', async (_name, cleanup) => {
    for (const maxBatches of [Infinity, 0, -1, 1.5]) {
      await expect(cleanup({ maxBatches })).rejects.toThrow('maxBatches must be a positive integer')
    }
  })
})
