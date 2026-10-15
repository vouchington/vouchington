import {
  sdkMergedSuccessNames,
  expectSdkSuccessNames,
} from '@voucha/test-helpers/mcp-sdk-success-names'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { randomBytes } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createRecommendedMcpCopyrightCorrespondence,
  useCopyrightMcpDecisionTools,
} from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { appendCopyrightEmailIntakeRecommendation } from '@services/copyright-notices/email-recommendations'
import { createCopyrightReplayFixture } from '@voucha/test-helpers/copyright-route-replay-setup'
import { exhaustCopyrightActionIntent } from '@voucha/test-helpers/copyright-route-replay-fixtures'
import {
  sdkCatalogCases as cases,
  connectSdkCatalog,
  callAndValidateSdkTool,
} from '@voucha/test-helpers/mcp-sdk-catalog'

async function connect(
  testCase: Parameters<typeof connectSdkCatalog>[0],
  account?: Parameters<typeof connectSdkCatalog>[1],
) {
  return connectSdkCatalog(testCase, account, async (url, fetch) => {
    const client = new Client({ name: 'voucha-registered-catalog-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(url, { fetch }))
    return client
  })
}

const observedMergedNames = new Set<string>()
const callAndValidate: typeof callAndValidateSdkTool = async (client, name, option, args) => {
  const result = await callAndValidateSdkTool(client, name, option, args)
  if (option !== null) observedMergedNames.add(name)
  return result
}
const counterRecommendation = {
  submission_kind: 'counter_notice',
  counter_notice_name: 'Hosted-material poster',
  counter_notice_address: '1 Main Street, Example City',
  counter_notice_telephone: '555-0100',
  counter_notice_electronic_signature: 'Hosted-material poster',
  consent_to_federal_jurisdiction: true,
  consent_to_service_of_process: true,
  good_faith_misidentification_under_penalty_of_perjury: true,
} as const

describe('copyright decisions through the registered admin SDK', () => {
  afterAll(() => expectSdkSuccessNames(observedMergedNames, sdkMergedSuccessNames.copyrightFixture))

  useCopyrightMcpDecisionTools()
  useCopyrightIntakeEnvironment()

  it('rejects a recommended email intake', async () => {
    const client = await connect(cases[3]!)
    try {
      const intake = await createParsedCopyrightEmailIntake()
      await appendCopyrightEmailIntakeRecommendation({
        intakeId: intake.id,
        inputSha256: randomBytes(32),
        promptVersion: 'copyright-email-intake-v1',
        model: 'synthetic-test-model',
        structuredOutput: { recommendation: 'reject' },
      })
      expect(
        await callAndValidate(client, 'review_copyright_email_intake', 'reject', {
          intake_id: intake.id,
          rationale: 'Staff reviewed the synthetic email intake.',
        }),
      ).toMatchObject({ reply_queued: true })
    } finally {
      await client.close()
    }
  })

  it('admits recommended correspondence', async () => {
    const client = await connect(cases[3]!)
    try {
      const fixture = await createRecommendedMcpCopyrightCorrespondence(counterRecommendation)
      expect(
        await callAndValidate(client, 'review_copyright_email_correspondence', 'admit', {
          intake_id: fixture.intake.id,
          kind: 'counter_notice',
          target_ids: [fixture.targetId],
          rationale: 'Staff verified the synthetic statutory fields.',
        }),
      ).toMatchObject({ copyright_notice: { id: fixture.noticeId }, is_duplicate: false })
    } finally {
      await client.close()
    }
  })

  it('rejects recommended correspondence', async () => {
    const client = await connect(cases[3]!)
    try {
      const fixture = await createRecommendedMcpCopyrightCorrespondence(counterRecommendation)
      expect(
        await callAndValidate(client, 'review_copyright_email_correspondence', 'reject', {
          intake_id: fixture.intake.id,
          kind: 'counter_notice',
          rationale: 'Staff rejected the synthetic correspondence.',
        }),
      ).toMatchObject({ copyright_notice: { id: fixture.noticeId }, is_duplicate: false })
    } finally {
      await client.close()
    }
  })

  it('replays an owned failed copyright action', async () => {
    const fixture = await createCopyrightReplayFixture()
    await exhaustCopyrightActionIntent(fixture.intentId)
    const client = await connect(cases[3]!)
    try {
      expect(
        await callAndValidate(client, 'replay_copyright_intent', 'action', {
          id: fixture.noticeId,
          intentId: fixture.intentId,
          rationale: 'Staff reviewed the failed synthetic action.',
        }),
      ).toMatchObject({ replayed: true })
    } finally {
      await client.close()
    }
  })
})
