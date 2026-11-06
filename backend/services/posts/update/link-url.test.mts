import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { createTestUrlWithHostname, linkTwoHopCanonicalUrlForTest } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { webRiskConfig } from '@services/web-risk/config'
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
