import {
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { windowAroundNow } from '@voucha/test-helpers/data-stores/psql/classifier-runs/usage-report-fixture'
import { insertTestAiUsageRecord } from '@voucha/test-helpers/entities/ai-usage'
import { describe, expect, it } from 'vitest'
import { readClassifierUsageReport } from './usage-report.mts'

async function leasedAgentRun() {
  const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
  await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
  await completeTaggingRunForTest(fixture)
  return { fixture, lease: await claimAutotaggerAgentLease(fixture.subject) }
}

async function reportOf(runId: string) {
  const report = await readClassifierUsageReport(windowAroundNow())
  const run = report.runs.find(candidate => candidate.runId === runId)
  if (!run) throw new Error('The agent run is missing from the report')
  return { report, run }
}

describe('classifier usage report: agent runs (real PG)', () => {
  it('rolls an agent run up by the provider and model its turns billed, one call per turn', async () => {
    const { fixture, lease } = await leasedAgentRun()
    for (const outputTokens of [30, 40, 50]) {
      await insertTestAiUsageRecord({
        classifierRunId: lease.runId,
        postId: fixture.post.id,
        agentSlug: 'autotagger-agent',
        provider: 'anthropic',
        transport: 'direct',
        model: 'claude-haiku-5-5',
        serviceTier: 'standard',
        outputTokens,
      })
    }

    const { report, run } = await reportOf(lease.runId)

    expect(run).toMatchObject({
      classifier: 'autotagger-agent',
      primitive: 'agent',
      batchId: null,
      promptVersionId: null,
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      providerCalls: 3,
      outputTokens: 120,
      candidateCount: 0,
    })
    expect(
      report.groups.find(
        group =>
          group.classifier === 'autotagger-agent' &&
          group.provider === 'anthropic' &&
          group.model === 'claude-haiku-5-5',
      ),
    ).toMatchObject({ providerCalls: expect.any(Number), promptVersionId: null })
    expect(report.efficiency.find(row => row.classifier === 'autotagger-agent')).toMatchObject({
      agentRuns: expect.any(Number),
      maxProviderCallsPerRun: 0,
      runsOverOneCall: 0,
    })
  })

  it('reports an agent run that has billed nothing yet with no provider or model', async () => {
    const { lease } = await leasedAgentRun()

    const { run } = await reportOf(lease.runId)

    expect(run).toMatchObject({ provider: null, model: null, providerCalls: 0 })
  })
})
