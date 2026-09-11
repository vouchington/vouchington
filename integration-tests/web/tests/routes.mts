import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import { parseHtml } from '../helpers/html-assertions.mts'
import { PLAYWRIGHT_CHROME_UA, SEEDED_IDS, TEST_USER_USERNAME } from '../helpers/constants.mts'
import {
  authenticateTestUserWithDirectSessionTokens,
  expectManualRedirectPath,
} from '../helpers/routing-assertions.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR

if (!workerOrigin || !traceOrigin || !artifactsDir) {
  throw new Error('Web integration environment is not configured')
}

let client: WebIntegrationClient

describe('web route tests', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  describe('consolidated topic routes', () => {
    const topics = [
      ['card', SEEDED_IDS.topic],
      ['rewards-program', SEEDED_IDS.rewardsProgram],
      ['rewards-program-status', SEEDED_IDS.rewardsProgramStatus],
      ['referral-program', SEEDED_IDS.referralProgram],
      ['topic', SEEDED_IDS.genericTopic],
    ] as const

    it('redirects bare topic URL to posts tab', async () => {
      await expectManualRedirectPath(
        client,
        workerOrigin,
        `/card/${SEEDED_IDS.topic}`,
        `/card/${SEEDED_IDS.topic}/posts`,
      )
    })

    it.each(
      topics.flatMap(([slug, id]) =>
        (['discussions', 'reviews', 'data-points'] as const).map(tab => ({ id, slug, tab })),
      ),
    )('$slug/$tab loads', async ({ id, slug, tab }) => {
      const result = await client.loadPage(`/${slug}/${id}/${tab}`, `route-${slug}-${tab}`)
      expect(result.response.status).not.toBe(404)
      expect(parseHtml(result.html, result.response.url).querySelector('h1')).toBeTruthy()
    })

    it('invalid topic slug returns 404', async () => {
      const response = await client.request(`/invalid-type/${SEEDED_IDS.topic}/discussions`)
      expect(response.status).toBe(404)
    })
  })

  describe('consolidated post routes', () => {
    it.each([
      ['review detail', `/review/${SEEDED_IDS.review}`],
      ['discussion detail', `/discussion/${SEEDED_IDS.discussion}`],
      ['data-point detail', `/data-point/${SEEDED_IDS.dataPoint}`],
    ] as const)('%s loads', async (label, path) => {
      const result = await client.loadPage(path, `route-${label.replaceAll(' ', '-')}`)
      expect(result.response.status).not.toBe(404)
    })

    it.each([
      ['invalid post slug', `/invalid-post/${SEEDED_IDS.discussion}`],
      ['wrong post type', `/review/${SEEDED_IDS.discussion}`],
    ] as const)('%s returns 404', async (_label, path) => {
      const response = await client.request(path)
      expect(response.status).toBe(404)
    })

    it('post edit page redirects to login when unauthenticated', async () => {
      await expectManualRedirectPath(
        client,
        workerOrigin,
        `/review/${SEEDED_IDS.review}/edit`,
        '/login',
      )
    })

    it('invalid edit and tag routes enforce post-type routing', async () => {
      await authenticateTestUserWithDirectSessionTokens(client)

      const paths = [
        `/article/${SEEDED_IDS.discussion}/tags/topic`,
        `/blog-post/${SEEDED_IDS.discussion}/tags/topic`,
        `/story/${SEEDED_IDS.discussion}/edit`,
        `/article/${SEEDED_IDS.discussion}/edit`,
        `/blog-post/${SEEDED_IDS.discussion}/edit`,
        `/invalid-post/${SEEDED_IDS.discussion}/tags/topic`,
        `/invalid-post/${SEEDED_IDS.discussion}/edit`,
      ]

      await paths.reduce(async (previous, path) => {
        await previous
        const response = await client.request(path, { userAgent: PLAYWRIGHT_CHROME_UA })
        expect({ path, status: response.status }).toEqual({ path, status: 404 })
      }, Promise.resolve())
    })

    it('authenticated edit pages load for supported post types', async () => {
      await authenticateTestUserWithDirectSessionTokens(client)

      const review = await client.loadPage(
        `/review/${SEEDED_IDS.review}/edit`,
        'route-review-edit',
        {
          userAgent: PLAYWRIGHT_CHROME_UA,
        },
      )
      expect(review.response.status).not.toBe(404)
      expect(parseHtml(review.html, review.response.url).body.textContent).toContain('Edit Review')

      const dataPoint = await client.loadPage(
        `/data-point/${SEEDED_IDS.dataPoint}/edit`,
        'route-data-point-edit',
        { userAgent: PLAYWRIGHT_CHROME_UA },
      )
      expect(dataPoint.response.status).not.toBe(404)
      expect(parseHtml(dataPoint.html, dataPoint.response.url).body.textContent).toContain(
        'Edit Data Point',
      )
    })
  })

  describe('user list routes', () => {
    it.each([
      ['followers', `/user/${TEST_USER_USERNAME}/users/followers`],
      ['following', `/user/${TEST_USER_USERNAME}/users/following`],
    ] as const)('%s list page loads', async (_label, path) => {
      const result = await client.loadPage(path, `route-user-list-${_label}`)
      expect(result.response.status).not.toBe(404)
    })

    it('user list returns 404 for unknown user', async () => {
      await authenticateTestUserWithDirectSessionTokens(client)
      const response = await client.request(`/user/nonexistent-user-xyz-000/users/followers`, {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })
      expect(response.status).toBe(404)
    })
  })

  describe('deleted subscription routes', () => {
    it('deleted /my/news-sources/subscribed page returns 404', async () => {
      await authenticateTestUserWithDirectSessionTokens(client)
      const response = await client.request(`/my/news-sources/subscribed`, {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })
      expect(response.status).toBe(404)
    })
  })
})
