import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import {
  POST_CONTENT_LIMITS_MAX_VALUES,
  postContentLimitsConfig,
} from '@services/post-content-limits'
import { getPostByAny } from '@services/posts/get'
import { syncPostImagePlacements } from '@services/posts/image-placements'
import { setPostImages } from '@services/posts/images'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { extractQueryName, getCapturedQueries } from '@voucha/test-helpers/explain-analyze'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId, seedUser } from '../run-support.mts'
import {
  readPostImageRows,
  resetPostImageRows,
  seedPostImageWriteFixture,
  writeCreatedPostImages,
} from './post-image-write-fixtures.mts'
import {
  assertPostImagePlacementChange,
  preparePostImagePlacementReplay,
  readPostImagePlacements,
} from './post-image-placement-fixtures.mts'

const pageSize = POST_CONTENT_LIMITS_MAX_VALUES.post_images_max
const placementWriteSize = Math.floor(pageSize / 2)
const createImageStatement = 'createPost:images'
const deleteImagesStatement = 'setPostImages:deleteImages'
const insertImagesStatement = 'setPostImages:insertImages'
const placementWrites = [
  {
    id: 'post-image-placement-retain-bindings-at-cap',
    statement: 'syncPostImagePlacements:retainBindings',
  },
  {
    id: 'post-image-placement-create-parent-at-cap',
    statement: 'syncPostImagePlacements:createParent',
  },
  {
    id: 'post-image-placement-create-child-at-cap',
    statement: 'syncPostImagePlacements:createChild',
  },
] as const

function assertCapturedImageWrites(names: readonly string[]): void {
  const captured = getCapturedQueries().map(query => extractQueryName(query.text))
  assert.deepEqual(
    captured.filter(name => name && names.includes(name)),
    names,
  )
}

async function runCreateImages() {
  const scenario = 'post-create-images-at-cap'
  const { postId, original } = await seedPostImageWriteFixture(pageSize)
  const unrelated = await readPostImageRows(seedPostId)
  assert.ok(unrelated.length > 0, 'Expected the seeded image corpus')
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [{ kind: 'maxInputRows', nodeType: 'Function Scan', max: pageSize }],
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      await writeCreatedPostImages(postId, original, query)
      assert.deepEqual(await readPostImageRows(postId, query), original)
      assertPostImagePlacementChange(
        [],
        await readPostImagePlacements(postId, query),
        original.map(row => row.image_id),
      )
      assert.deepEqual(await readPostImageRows(seedPostId, query), unrelated)
      assertCapturedImageWrites([createImageStatement])
      await query.rollback()
    },
    undefined,
    createImageStatement,
  )
}

async function seedOriginalImages() {
  const fixture = await seedPostImageWriteFixture(pageSize)
  await using query = await beginTransaction()
  await writeCreatedPostImages(fixture.postId, fixture.original, query)
  await query.commit()
  return fixture
}

async function runReplaceImages() {
  const scenario = 'post-replace-images-at-cap'
  const { postId, original, replacement } = await seedOriginalImages()
  const post = await getPostByAny(postId)
  assert.ok(post)
  const before = await readPostImagePlacements(postId)
  const unrelated = await readPostImageRows(seedPostId)
  assert.equal(before.length, pageSize)
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [{ kind: 'maxProcessedRows', relation: 'post_images', max: pageSize }],
    forbidSequentialScans: ['post_images'],
  })
  let replayStarted = false
  try {
    await runAndCapture(
      scenario,
      async () => {
        const saved = await setPostImages(seedUser, post, replacement)
        const persisted = await readPostImageRows(postId)
        const placements = await readPostImagePlacements(postId)
        assert.deepEqual(persisted, replacement)
        assert.deepEqual(
          saved,
          replacement.map(row => {
            const placement = placements.find(item => item.image_id === row.image_id)!
            return {
              ...row,
              placement_id: placement.placement_id,
              placement_revision: placement.revision,
            }
          }),
        )
        assertPostImagePlacementChange(
          before,
          placements,
          replacement.map(row => row.image_id),
        )
        assert.deepEqual(await readPostImageRows(seedPostId), unrelated)
        assertCapturedImageWrites([deleteImagesStatement, insertImagesStatement])
      },
      undefined,
      [deleteImagesStatement, insertImagesStatement],
      {
        beforeExplain: async ({ text }) => {
          replayStarted = true
          await resetPostImageRows(
            postId,
            extractQueryName(text) === deleteImagesStatement ? original : [],
          )
        },
      },
    )
  } finally {
    if (replayStarted) await resetPostImageRows(postId, replacement)
  }
}

async function runPlacementWrite({ id, statement }: (typeof placementWrites)[number]) {
  const { postId, replacement } = await seedOriginalImages()
  const before = await readPostImagePlacements(postId)
  assert.equal(before.length, pageSize)
  const requestedIds = replacement.map(row => row.image_id)
  const unrelated = await readPostImagePlacements(seedPostId)
  let created: ReturnType<typeof assertPostImagePlacementChange> = []
  registerScenarioContract(id, {
    allowEmptyResult: true,
    expectations: [{ kind: 'maxInputRows', nodeType: 'Function Scan', max: placementWriteSize }],
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      await syncPostImagePlacements(postId, requestedIds, query)
      created = assertPostImagePlacementChange(
        before,
        await readPostImagePlacements(postId, query),
        requestedIds,
      )
      assert.equal(created.length, placementWriteSize)
      assert.deepEqual(await readPostImagePlacements(seedPostId, query), unrelated)
      assertCapturedImageWrites([statement])
      await query.rollback()
    },
    undefined,
    statement,
    {
      afterCapture: async () => {
        if (statement === 'syncPostImagePlacements:retainBindings') return
        const createChild = statement === 'syncPostImagePlacements:createChild'
        await preparePostImagePlacementReplay(created, createChild)
      },
    },
  )
}

export async function runPostImageWriteScenarios(): Promise<void> {
  await postContentLimitsConfig.waitForInitialization()
  const restore = overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
    post_images_max: pageSize,
  })
  try {
    await runCreateImages()
    await runReplaceImages()
    for (const placementWrite of placementWrites) await runPlacementWrite(placementWrite)
  } finally {
    restore()
  }
}
