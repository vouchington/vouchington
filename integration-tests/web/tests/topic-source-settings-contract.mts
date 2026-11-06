import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import { PLAYWRIGHT_CHROME_UA, SEEDED_IDS } from '../helpers/constants.mts'
import { authenticateAdminWithVerifiedMfa } from '../helpers/routing-assertions.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR
if (!workerOrigin || !traceOrigin || !artifactsDir)
  throw new Error('Web integration environment is not configured')
let client: WebIntegrationClient

import { parseHtml } from '../helpers/html-assertions.mts'
import { createTestTopic } from '../../../backend/test-helpers/entities/create-test-entities.mts'

describe('typed source management contracts', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  const seededAboutTopics = [
    ['card', SEEDED_IDS.topic],
    ['rewards-program', SEEDED_IDS.rewardsProgram],
    ['rewards-program-status', SEEDED_IDS.rewardsProgramStatus],
    ['referral-program', SEEDED_IDS.referralProgram],
    ['topic', SEEDED_IDS.genericTopic],
  ] as const

  async function loadAboutSettings(slug: string, id: string) {
    return client.loadPage(`/${slug}/${id}/settings/about`, `source-guard-${slug}-about`, {
      userAgent: PLAYWRIGHT_CHROME_UA,
    })
  }

  function expectAboutSettings(html: string, url: string): void {
    expect(parseHtml(html, url).querySelector('[data-pw="topic-settings-about"]')).toBeTruthy()
  }

  it.each(seededAboutTopics)('renders about settings for a %s topic', async (slug, id) => {
    await authenticateAdminWithVerifiedMfa(client)
    const about = await loadAboutSettings(slug, id)
    expect(about.response.status).toBe(200)
    expectAboutSettings(about.html, about.response.url)
  })

  it('renders about settings for a bank account topic', async () => {
    await authenticateAdminWithVerifiedMfa(client)
    const bankAccount = await createTestTopic({ topic_type: 'bank_account' })
    const about = await loadAboutSettings('bank-account', bankAccount.id)
    expect(about.response.status).toBe(200)
    expectAboutSettings(about.html, about.response.url)
  })

  it('rejects source settings for typed non-source topics', async () => {
    await authenticateAdminWithVerifiedMfa(client)
    const bankAccount = await createTestTopic({ topic_type: 'bank_account' })
    const options = { userAgent: PLAYWRIGHT_CHROME_UA }

    expect(
      (await client.request(`/bank-account/${bankAccount.id}/settings/source`, options)).status,
    ).toBe(404)
    expect(
      (await client.request(`/card/${SEEDED_IDS.topic}/settings/source`, options)).status,
    ).toBe(404)
    expect(
      (
        await client.request(
          `/rewards-program/${SEEDED_IDS.rewardsProgram}/settings/source`,
          options,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await client.request(
          `/rewards-program-status/${SEEDED_IDS.rewardsProgramStatus}/settings/source`,
          options,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await client.request(
          `/referral-program/${SEEDED_IDS.referralProgram}/settings/source`,
          options,
        )
      ).status,
    ).toBe(404)
    expect(
      (await client.request(`/topic/${SEEDED_IDS.genericTopic}/settings/source`, options)).status,
    ).toBe(404)
  })

  it('renders source settings for an RSS feed', async () => {
    await authenticateAdminWithVerifiedMfa(client)
    const source = await createTestTopic({ topic_type: 'rss_feed' })
    const options = { userAgent: PLAYWRIGHT_CHROME_UA }
    const accepted = await client.loadPage(
      `/source/${source.id}/settings/source`,
      'source-guard-accepted',
      options,
    )
    expect(accepted.response.status).toBe(200)
    expect(parseHtml(accepted.html, accepted.response.url).body.textContent).toContain(source.name)
  })
})
