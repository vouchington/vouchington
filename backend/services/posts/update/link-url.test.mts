import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUrlWithHostname,
  insertHackerNewsReferencesForTest,
  linkTwoHopCanonicalUrlForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { webRiskConfig } from '@services/web-risk/config'
import { insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { getPostHackerNewsFlagStateForTest } from '@voucha/test-helpers/hacker-news-flag-state'
import { getUrlById } from '@services/urls/get'
import { updatePost } from '../update.mts'
import { getPostByAny } from '../get.mts'
import { assessPostLinkEdit } from './link-url.mts'
import { setCanonicalUrl } from '@services/urls/set-canonical'
import {
  createPostLinkEditFixtureForTest,
  blockPostLinkDestinationForTest,
  persistAssessedPostLinkEditForTest,
} from '@voucha/test-helpers/post-link-edits'

describe('post link URL-ID policy', () => {
  beforeEach(async () => {
    await webRiskConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: false }))
  })

  it('preserves an existing HTTP destination identity and recomputes its reference flag', async () => {
    const { user, post } = await createPostLinkEditFixtureForTest()
    const destination = await insertTestUrlDirect(
      null,
      `http://link-protocol-${randomUUID()}.example.com/article`,
      { preserveHttp: true },
    )
    if (!destination) throw new Error('Expected an HTTP destination fixture')
    await insertHackerNewsReferencesForTest({
      url_id: destination.id,
      story_count: 1,
      comment_count: 0,
    })

    await updatePost(user, post, { url_id: destination.id })

    expect((await getPostByAny(post.id, { readOnly: false }))?.url_id).toBe(destination.id)
    expect((await getUrlById(destination.id, { readOnly: false }))?.url).toBe(destination.url)
    expect(await getPostHackerNewsFlagStateForTest(post.id)).toEqual({
      stored: true,
      expected: true,
    })
  })

  it('rejects a blocked existing destination without changing the post link', async () => {
    const { user, originalId, post } = await createPostLinkEditFixtureForTest()
    const destination = await createTestUrlWithHostname()
    await blockPostLinkDestinationForTest(destination)
    await expect(updatePost(user, post, { url_id: destination })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/^Domain is blocked:/),
    })
    expect((await getPostByAny(post.id))?.url_id).toBe(originalId)
  })

  it('assesses the final destination of a two-hop alias before accepting its ID', async () => {
    const { user, originalId, post } = await createPostLinkEditFixtureForTest()
    const source = await createTestUrlWithHostname()
    const middle = await createTestUrlWithHostname()
    const destination = await createTestUrlWithHostname()
    await linkTwoHopCanonicalUrlForTest(source, middle, destination)
    await blockPostLinkDestinationForTest(destination)
    await expect(updatePost(user, post, { url_id: source })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/^Domain is blocked:/),
    })
    expect((await getPostByAny(post.id))?.url_id).toBe(originalId)
  })

  it('rechecks hostname blocks committed after unlocked URL assessment', async () => {
    const { user, originalId, post } = await createPostLinkEditFixtureForTest()
    const destination = await createTestUrlWithHostname()
    const assessment = await assessPostLinkEdit(post, { url_id: destination })
    if (!assessment.urls) throw new Error('Expected an assessed URL-ID destination')
    await blockPostLinkDestinationForTest(destination)
    await expect(
      persistAssessedPostLinkEditForTest(user.id, assessment.changes, assessment.urls),
    ).rejects.toMatchObject({ status: 422 })
    expect((await getPostByAny(post.id))?.url_id).toBe(originalId)
  })

  it('rejects a canonical destination retargeted after assessment', async () => {
    const { user, originalId, post } = await createPostLinkEditFixtureForTest()
    const destination = await createTestUrlWithHostname()
    const nextDestination = await createTestUrlWithHostname()
    const assessment = await assessPostLinkEdit(post, { url_id: destination })
    if (!assessment.urls) throw new Error('Expected an assessed URL-ID destination')
    await setCanonicalUrl(destination, nextDestination)
    await expect(
      persistAssessedPostLinkEditForTest(user.id, assessment.changes, assessment.urls),
    ).rejects.toMatchObject({ status: 422, message: 'URL destination changed; retry the edit' })
    expect((await getPostByAny(post.id))?.url_id).toBe(originalId)
  })
})
