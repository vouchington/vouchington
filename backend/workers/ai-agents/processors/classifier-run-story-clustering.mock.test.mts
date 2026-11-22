import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStoryClusteringClient, executeStoryClusteringRun } from '@agents/story-clustering'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { CLASSIFIER_RUN_ATTEMPTS } from '@queues/ai-agents/config'
import { spendCapConfig } from '@services/ai-usage'
import { claimClassifierRun } from '@services/classifier-runs'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import {
  attemptStoryClusteringJoin,
  commitCompetingStoryMembership,
  createIncomingWithStoryNeighbor,
  storyClusteringDecisionResponse,
  storyExistsWithTitle,
} from '@voucha/test-helpers/story-clustering-membership'
import { createStoryClusteringRunAdapter } from '@services/stories'
import { classifierRunJobFor } from '@voucha/test-helpers/classifier-run-worker'
import {
  expireClassifierRunLeaseForTest,
  getSubjectClassifierRunFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { reviseStoryClusteringItem } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import {
  createStoryClusteringItem,
  readItemStoryId,
  readStoryFacts,
  readStoryRunCandidates,
  reserveStoryClusteringRun,
  STORY_CLUSTERING_CLASSIFIER_SLUG as SLUG,
  type StoryClusteringItem,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { toClassifierRunJobData } from './classifier-run-handler.mts'
import { processClassifierRun } from './process-classifier-run.mts'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

const provider = vi.mocked(fetchStructuredDecisionProvider)
const adapter = createStoryClusteringRunAdapter()

/** The criteria of every question the provider was asked, in call order. */
let askedCriteria: string[][] = []

/** A provider that picks `chosen` (a criterion key) for every question it is asked. */
function pick(chosen: (criteria: string[]) => string) {
  provider.mockImplementation(async (_url, init) =>
    storyClusteringDecisionResponse(init, criteria => {
      askedCriteria.push(criteria)
      return chosen(criteria)
    }),
  )
}

const pickNeighbor = (item: StoryClusteringItem) => () => `rss_feed_item:${item.itemId}`

const runFacts = async (item: StoryClusteringItem) =>
  (await getSubjectClassifierRunFacts(item.subject, SLUG))[0]

async function drain(attempt: () => Promise<string>, times: number): Promise<string[]> {
  return times === 0 ? [] : [await attempt(), ...(await drain(attempt, times - 1))]
}

describe('C9 story clustering through the shared lifecycle (real PG, mocked provider)', () => {
  let restoreSpendCap: (() => void) | undefined
  beforeAll(async () => {
    await spendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
  })
  beforeEach(() => {
    askedCriteria = []
    vi.stubEnv('OPENAI_API_KEY', 'test-provider-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    provider.mockReset()
  })
  afterAll(() => restoreSpendCap?.())

  it('makes one provider call for the whole candidate set and joins the picked pair into a story', async () => {
    const { neighbor, incoming } = await createIncomingWithStoryNeighbor()
    pick(pickNeighbor(neighbor))
    const run = await reserveStoryClusteringRun(incoming)

    const result = await processClassifierRun(
      classifierRunJobFor(toClassifierRunJobData(SLUG, run)),
    )

    expect(result).toEqual({ kind: 'completed' })
    expect(provider).toHaveBeenCalledOnce()
    expect(askedCriteria).toEqual([[`rss_feed_item:${neighbor.itemId}`, 'none']])
    const storyId = await readItemStoryId(incoming.itemId)
    expect(storyId).not.toBeNull()
    expect(await readItemStoryId(neighbor.itemId)).toBe(storyId)
    expect((await readStoryFacts(storyId!)).member_ids.toSorted()).toEqual(
      [incoming.itemId, neighbor.itemId].toSorted(),
    )
    expect(await runFacts(incoming)).toMatchObject({
      provider_attempts_started: 1,
      completed_at: expect.any(Date),
    })
  })

  it('leaves the incoming item standalone when the candidate moves before the join writes', async () => {
    const { neighbor, incoming } = await createIncomingWithStoryNeighbor()
    const [initialStory, destinationStory] = await Promise.all([
      insertTestStory(),
      insertTestStory(),
    ])
    pick(pickNeighbor(neighbor))
    const data = toClassifierRunJobData(SLUG, await reserveStoryClusteringRun(incoming))
    await setTestItemStoryId(neighbor.itemId, initialStory.id)
    const restoreMove = commitCompetingStoryMembership('join', neighbor.itemId, destinationStory.id)

    try {
      await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
        kind: 'completed',
      })
      await expect(readItemStoryId(neighbor.itemId)).resolves.toBe(destinationStory.id)
      await expect(readItemStoryId(incoming.itemId)).resolves.toBeNull()
    } finally {
      restoreMove()
    }
  })

  it('leaves the incoming item standalone when its digest changed before joining', async () => {
    const { incoming } = await createIncomingWithStoryNeighbor()
    const story = await insertTestStory()
    await reviseStoryClusteringItem(incoming.itemId)

    await expect(
      attemptStoryClusteringJoin(incoming.itemId, story.id, incoming.inputSha256),
    ).resolves.toEqual({ kind: 'skipped', reason: 'item_unavailable' })
    await expect(readItemStoryId(incoming.itemId)).resolves.toBeNull()
  })

  it('rolls back a partial founding assignment and converges after lease expiry', async () => {
    const provisionalTitle = `Provisional story ${randomUUID()}`
    const { neighbor, incoming } = await createIncomingWithStoryNeighbor(provisionalTitle)
    const winnerStory = await insertTestStory()
    pick(pickNeighbor(neighbor))
    const run = await reserveStoryClusteringRun(incoming)
    const data = toClassifierRunJobData(SLUG, run)
    const restore = commitCompetingStoryMembership('pair', neighbor.itemId, winnerStory.id)

    try {
      await expect(processClassifierRun(classifierRunJobFor(data))).rejects.toThrow(
        'Story clustering could not assign both founding members',
      )
    } finally {
      restore()
    }

    await expect(readItemStoryId(neighbor.itemId)).resolves.toBe(winnerStory.id)
    await expect(readItemStoryId(incoming.itemId)).resolves.toBeNull()
    await expect(storyExistsWithTitle(provisionalTitle)).resolves.toBe(false)
    expect(await runFacts(incoming)).toMatchObject({
      completed_at: null,
      provider_attempts_started: 1,
    })

    await expireClassifierRunLeaseForTest(run.runId)
    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'completed',
    })
    expect(provider).toHaveBeenCalledOnce()
    await expect(readItemStoryId(incoming.itemId)).resolves.toBe(winnerStory.id)
    expect(await runFacts(incoming)).toMatchObject({ completed_at: expect.any(Date) })
  })

  it('leaves the item standalone when the model picks none of the candidates', async () => {
    const { incoming } = await createIncomingWithStoryNeighbor()
    pick(() => 'none')
    const run = await reserveStoryClusteringRun(incoming)

    const result = await processClassifierRun(
      classifierRunJobFor(toClassifierRunJobData(SLUG, run)),
    )

    expect(result).toEqual({ kind: 'completed' })
    expect(await readItemStoryId(incoming.itemId)).toBeNull()
    expect(await runFacts(incoming)).toMatchObject({ completed_at: expect.any(Date) })
  })

  it('replays a completed run without reserving or billing a second provider attempt', async () => {
    const { neighbor, incoming } = await createIncomingWithStoryNeighbor()
    pick(pickNeighbor(neighbor))
    const data = toClassifierRunJobData(SLUG, await reserveStoryClusteringRun(incoming))
    await processClassifierRun(classifierRunJobFor(data))
    const storyId = await readItemStoryId(incoming.itemId)

    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'replay',
    })
    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'replay',
    })

    expect(provider).toHaveBeenCalledOnce()
    expect(await readItemStoryId(incoming.itemId)).toBe(storyId)
    expect(await runFacts(incoming)).toMatchObject({ provider_attempts_started: 1 })
  })

  it('completes a run whose lease expired after its decision persisted, without asking again', async () => {
    const { neighbor, incoming } = await createIncomingWithStoryNeighbor()
    pick(pickNeighbor(neighbor))
    const run = await reserveStoryClusteringRun(incoming)
    const claim = await claimClassifierRun(adapter, {
      runId: run.runId,
      subject: run.subject,
      inputSha256: run.inputSha256,
      configurationSha256: run.configurationSha256,
      leaseSeconds: 60,
    })
    if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
    await expect(
      executeStoryClusteringRun(
        {
          adapter,
          lease: claim.lease,
          maxAttempts: CLASSIFIER_RUN_ATTEMPTS,
          signal: AbortSignal.timeout(30_000),
        },
        {
          createClient: hooks =>
            createStoryClusteringClient({
              selection: {
                provider: claim.lease.resolved.configuration.modelProvider,
                model: claim.lease.resolved.configuration.modelName,
              },
              classifierRunId: hooks.classifierRunId,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      ),
    ).resolves.toBe('persisted')
    await expireClassifierRunLeaseForTest(run.runId)

    const result = await processClassifierRun(
      classifierRunJobFor(toClassifierRunJobData(SLUG, run)),
    )

    expect(result).toEqual({ kind: 'completed' })
    expect(provider).toHaveBeenCalledOnce()
    expect(await readItemStoryId(incoming.itemId)).not.toBeNull()
    expect(await runFacts(incoming)).toMatchObject({ provider_attempts_started: 1 })
  })

  it('keeps asking the captured candidates when a closer neighbor has appeared since', async () => {
    const { feed, neighbor, incoming, at } = await createIncomingWithStoryNeighbor()
    pick(() => 'none')
    const run = await reserveStoryClusteringRun(incoming)
    const captured = await readStoryRunCandidates(run.runId)
    await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.999) })

    await processClassifierRun(classifierRunJobFor(toClassifierRunJobData(SLUG, run)))

    expect(captured).toEqual([{ rssFeedItemId: neighbor.itemId }])
    expect(askedCriteria).toEqual([[`rss_feed_item:${neighbor.itemId}`, 'none']])
  })

  it('ends the run at the attempt cap and never reaches the provider again', async () => {
    const { incoming } = await createIncomingWithStoryNeighbor()
    const data = toClassifierRunJobData(SLUG, await reserveStoryClusteringRun(incoming))
    provider.mockRejectedValue(new Error('provider unreachable'))
    const attempt = () =>
      processClassifierRun(classifierRunJobFor(data))
        .then(result => result.kind)
        .catch(() => 'threw')

    const outcomes = await drain(attempt, CLASSIFIER_RUN_ATTEMPTS + 1)

    expect(provider).toHaveBeenCalledTimes(CLASSIFIER_RUN_ATTEMPTS)
    expect(outcomes.at(-1)).toBe('terminal')
    expect(await runFacts(incoming)).toMatchObject({
      provider_attempts_started: CLASSIFIER_RUN_ATTEMPTS,
      terminal_failure_kind: 'provider-error',
    })
    expect(await readItemStoryId(incoming.itemId)).toBeNull()
  })

  it('does not bill a provider call for an item whose content changed after the request', async () => {
    const { incoming } = await createIncomingWithStoryNeighbor()
    pick(() => 'none')
    const data = toClassifierRunJobData(SLUG, await reserveStoryClusteringRun(incoming))
    await reviseStoryClusteringItem(incoming.itemId)

    const result = await processClassifierRun(classifierRunJobFor(data))

    expect(result.kind).toBe('stale')
    expect(provider).not.toHaveBeenCalled()
  })
})
