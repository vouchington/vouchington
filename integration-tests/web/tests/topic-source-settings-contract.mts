import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import { PLAYWRIGHT_CHROME_UA, SEEDED_IDS } from '../helpers/constants.mts'
import { authenticateTestUserWithDirectSessionTokens } from '../helpers/routing-assertions.mts'

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
  it('source settings reject correctly typed non-source topics but accept a real RSS source', async () => {
    await authenticateTestUserWithDirectSessionTokens(client)
    const bankAccount = await createTestTopic({ topic_type: 'bank_account' })
    const source = await createTestTopic({ topic_type: 'rss_feed' })
    const options = { userAgent: PLAYWRIGHT_CHROME_UA }

    await Promise.all(
      [
        ['bank-account', bankAccount.id],
        ['card', SEEDED_IDS.topic],
        ['rewards-program', SEEDED_IDS.rewardsProgram],
        ['rewards-program-status', SEEDED_IDS.rewardsProgramStatus],
        ['referral-program', SEEDED_IDS.referralProgram],
        ['topic', SEEDED_IDS.genericTopic],
      ].map(async ([slug, id]) => {
        const about = await client.loadPage(
          `/${slug}/${id}/settings/about`,
          `source-guard-${slug}-about`,
          options,
        )
        expect(about.response.status).toBe(200)
        expect(
          parseHtml(about.html, about.response.url).querySelector(
            '[data-pw="topic-settings-about"]',
          ),
        ).toBeTruthy()
      }),
    )

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

    const accepted = await client.loadPage(
      `/source/${source.id}/settings/source`,
      'source-guard-accepted',
      options,
    )
    expect(accepted.response.status).toBe(200)
    expect(parseHtml(accepted.html, accepted.response.url).body.textContent).toContain(source.name)
  })
})
