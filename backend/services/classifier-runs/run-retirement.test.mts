import {
  getClassifierRunRequestFacts,
  type ClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { withSweepPrerequisite } from '@voucha/test-helpers/data-stores/psql/classifier-runs/request-retirement'
import {
  createSyntheticFixture,
  reviseSyntheticPost,
  setSyntheticPostContent,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import { requestSyntheticRun } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { describe, expect, it } from 'vitest'
import { listPendingClassifierRunRequests } from './run-discovery.mts'
import { retireIneligibleClassifierRunRequests } from './run-retirement.mts'

type Setup = Awaited<ReturnType<typeof createSyntheticFixture>>

/** Post ids the sweep dispatches across every page, `limit` requests at a time. */
async function sweptPostIds(
  adapter: Setup['adapter'],
  limit = 100,
  after: string | null = null,
): Promise<string[]> {
  const page = await listPendingClassifierRunRequests(adapter, after, limit)
  const ids = page.items.map(item => item.postId ?? '')
  return page.next ? [...ids, ...(await sweptPostIds(adapter, limit, page.next))] : ids
}

async function onlyRequest(setup: Setup): Promise<ClassifierRunRequestFacts> {
  const requests = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
  expect(requests).toHaveLength(1)
  return requests[0]!
}

describe('terminal ineligibility of classifier run requests (real PG)', () => {
  it('retires the request of a subject that is no longer live, so the sweep stops selecting it', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    await setTestPostClearanceStatus(setup.post.id, 'pending')

    expect(await sweptPostIds(setup.adapter)).toEqual([])

    const request = await onlyRequest(setup)
    expect(request.stale_at).not.toBeNull()
    expect(request.run_id).toBeNull()
    expect(request.no_work_at).toBeNull()
  })

  it('keeps the request of a live subject that is only waiting, and sweeps it once it is ready', async () => {
    const setup = await createSyntheticFixture()
    const waiting = withSweepPrerequisite(setup.adapter)
    await requestSyntheticRun(setup)

    expect(await sweptPostIds(waiting.adapter)).toEqual([])
    expect(await onlyRequest(setup)).toMatchObject({
      stale_at: null,
      run_id: null,
      no_work_at: null,
    })

    waiting.prerequisite.met = true
    expect(await sweptPostIds(waiting.adapter)).toEqual([setup.post.id])
  })

  it('sweeps a retired request again when the subject is approved again', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    await setTestPostClearanceStatus(setup.post.id, 'pending')
    expect(await sweptPostIds(setup.adapter)).toEqual([])

    await setTestPostClearanceStatus(setup.post.id, 'approved')
    await requestSyntheticRun(setup)

    expect(await sweptPostIds(setup.adapter)).toEqual([setup.post.id])
    expect((await onlyRequest(setup)).stale_at).toBeNull()
  })

  it('retires only the content version that left, and gives new content its own request', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const revised = await reviseSyntheticPost(setup.post.id)

    expect(await sweptPostIds(setup.adapter)).toEqual([])
    expect((await onlyRequest(setup)).stale_at).not.toBeNull()

    await requestSyntheticRun(setup, revised)
    expect(await sweptPostIds(setup.adapter)).toEqual([setup.post.id])

    await setSyntheticPostContent(setup.post.id, setup.post.inputSha256)
    await requestSyntheticRun(setup)
    expect(await sweptPostIds(setup.adapter)).toEqual([setup.post.id])
  })

  it('leaves a request pending when the subject is live at its content after all', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)

    await retireIneligibleClassifierRunRequests(setup.adapter, [
      { subject: setup.subject, inputSha256: setup.post.inputSha256 },
    ])

    expect((await onlyRequest(setup)).stale_at).toBeNull()
    expect(await sweptPostIds(setup.adapter)).toEqual([setup.post.id])
  })

  it('never retires the request for newer content when it retires an older version', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const revised = await reviseSyntheticPost(setup.post.id)
    await requestSyntheticRun(setup, revised)

    await retireIneligibleClassifierRunRequests(setup.adapter, [
      { subject: setup.subject, inputSha256: setup.post.inputSha256 },
    ])

    const requests = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    const current = requests.find(request => request.input_sha256.equals(revised))
    expect(current).toMatchObject({ stale_at: null, run_id: null, no_work_at: null })
    expect(await sweptPostIds(setup.adapter)).toEqual([setup.post.id])
  })

  it('retires ineligible requests while paging and still reaches the eligible ones', async () => {
    const live = await createSyntheticFixture()
    const gone = await createSyntheticFixture()
    const edited = await createSyntheticFixture()
    await requestSyntheticRun(live)
    await requestSyntheticRun({ ...gone, slug: live.slug })
    await requestSyntheticRun({ ...edited, slug: live.slug })
    await setTestPostClearanceStatus(gone.post.id, 'pending')
    await reviseSyntheticPost(edited.post.id)

    expect(await sweptPostIds(live.adapter, 1)).toEqual([live.post.id])

    const goneRequests = await getClassifierRunRequestFacts(gone.post.id, live.slug)
    const editedRequests = await getClassifierRunRequestFacts(edited.post.id, live.slug)
    expect(goneRequests.map(request => request.stale_at !== null)).toEqual([true])
    expect(editedRequests.map(request => request.stale_at !== null)).toEqual([true])
    expect((await onlyRequest(live)).stale_at).toBeNull()
  })
})
