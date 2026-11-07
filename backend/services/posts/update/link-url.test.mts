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
  persistPostLinkWhileCanonicalRewriteForTest,
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

  it('fences a concurrent canonical rewrite before it can invert alias and terminal row locks', async () => {
    const { user, post } = await createPostLinkEditFixtureForTest()
    const suffix = randomUUID()
    const alias = await insertTestUrlDirect(null, `https://a-alias-${suffix}.example.com/article`)
    const terminal = await insertTestUrlDirect(
      null,
      `https://z-terminal-${suffix}.example.com/article`,
    )
    if (!alias || !terminal) throw new Error('Expected ordered alias and terminal URLs')
    const nextDestination = await createTestUrlWithHostname()
    await setCanonicalUrl(alias.id, terminal.id)
    const assessment = await assessPostLinkEdit(post, { url: alias.url })
    if (!assessment.urls) throw new Error('Expected an assessed alias and terminal')

    expect(
      await persistPostLinkWhileCanonicalRewriteForTest(
        user.id,
        assessment.changes,
        assessment.urls,
        terminal.id,
        nextDestination,
      ),
    ).toEqual({ selectedId: terminal.id, rewrittenId: nextDestination })
    expect((await getUrlById(alias.id, { readOnly: false }))?.canonical_url_id).toBe(
      nextDestination,
    )
  })

  it.each([false, true])(
    'rejects a raw alias to a blocked terminal with two hops: %s',
    async twoHops => {
      const { user, originalId, post } = await createPostLinkEditFixtureForTest()
      const source = await createTestUrlWithHostname()
      const destination = await createTestUrlWithHostname()
      if (twoHops) {
        await linkTwoHopCanonicalUrlForTest(source, await createTestUrlWithHostname(), destination)
      } else {
        await setCanonicalUrl(source, destination)
      }
      const alias = await getUrlById(source, { readOnly: false })
      if (!alias) throw new Error('Expected an alias URL')
      await blockPostLinkDestinationForTest(destination)
      await expect(updatePost(user, post, { url: alias.url })).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/^Domain is blocked:/),
      })
      expect((await getPostByAny(post.id))?.url_id).toBe(originalId)
    },
  )

  it('rechecks a raw alias terminal hostname blocked after assessment', async () => {
    const { user, post } = await createPostLinkEditFixtureForTest()
    const source = await createTestUrlWithHostname()
    const destination = await createTestUrlWithHostname()
    await setCanonicalUrl(source, destination)
    const alias = await getUrlById(source, { readOnly: false })
    if (!alias) throw new Error('Expected an alias URL')
    const assessment = await assessPostLinkEdit(post, { url: alias.url })
    if (!assessment.urls) throw new Error('Expected an assessed raw alias')
    await blockPostLinkDestinationForTest(destination)
    await expect(
      persistAssessedPostLinkEditForTest(user.id, assessment.changes, assessment.urls),
    ).rejects.toMatchObject({ status: 422 })
  })

  it.each(['alias', 'terminal'])(
    'rejects a raw alias whose %s retargets after assessment',
    async target => {
      const { user, post } = await createPostLinkEditFixtureForTest()
      const source = await createTestUrlWithHostname()
      const destination = await createTestUrlWithHostname()
      const nextDestination = await createTestUrlWithHostname()
      await setCanonicalUrl(source, destination)
      const alias = await getUrlById(source, { readOnly: false })
      if (!alias) throw new Error('Expected an alias URL')
      const assessment = await assessPostLinkEdit(post, { url: alias.url })
      if (!assessment.urls) throw new Error('Expected an assessed raw alias')
      await blockPostLinkDestinationForTest(nextDestination)
      await setCanonicalUrl(target === 'alias' ? source : destination, nextDestination)
      await expect(
        persistAssessedPostLinkEditForTest(user.id, assessment.changes, assessment.urls),
      ).rejects.toMatchObject({ status: 422, message: 'URL destination changed; retry the edit' })
    },
  )

  it('rejects an unassessed canonical target inserted with a previously unknown raw URL', async () => {
    const { user, post } = await createPostLinkEditFixtureForTest()
    const href = `https://raw-appeared-${randomUUID()}.example.com/article`
    const assessment = await assessPostLinkEdit(post, { url: href })
    if (!assessment.urls) throw new Error('Expected an assessed new URL')
    const alias = await insertTestUrlDirect(null, href)
    if (!alias) throw new Error('Expected the concurrently inserted alias')
    const destination = await createTestUrlWithHostname()
    await blockPostLinkDestinationForTest(destination)
    await setCanonicalUrl(alias.id, destination)
    await expect(
      persistAssessedPostLinkEditForTest(user.id, assessment.changes, assessment.urls),
    ).rejects.toMatchObject({ status: 422, message: 'URL destination changed; retry the edit' })
  })

  it('accepts a healthy raw two-hop alias while preserving its HTTP terminal and reference flag', async () => {
    const { user, post } = await createPostLinkEditFixtureForTest()
    const source = await createTestUrlWithHostname()
    const destination = await insertTestUrlDirect(
      null,
      `http://raw-terminal-${randomUUID()}.example.com/article`,
      { preserveHttp: true },
    )
    if (!destination) throw new Error('Expected an HTTP terminal URL')
    await linkTwoHopCanonicalUrlForTest(source, await createTestUrlWithHostname(), destination.id)
    const alias = await getUrlById(source, { readOnly: false })
    if (!alias) throw new Error('Expected an alias URL')
    await insertHackerNewsReferencesForTest({
      url_id: destination.id,
      story_count: 1,
      comment_count: 0,
    })
    await updatePost(user, post, { url: alias.url })
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
