import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestUserDirect,
  createReferralProgramFixture,
  createTestMembership,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { createChildReferralLinks } from '@services/user-referral-program-links/create-child'
import { getUserReferralLink } from '@services/user-referral-program-links/get'
import { deleteUserReferralLink } from '@services/user-referral-program-links/delete'
import { getActiveChildUrlIdsForTest } from '@voucha/test-helpers/entities/referral-links'
import { addUrl } from '@services/urls/upsert'
import type { PrivateUser } from '@services/users/types'
import * as browserCrawl from '@services/browser-crawl'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'
import {
  answerPostgresReadsForTest,
  rejectPostgresReadForTest,
} from '@voucha/test-helpers/injected-failures'
import { constructChildUrls, type getAmexCardSlugCatalog } from './construct-amex-children.mts'
import { runReferralLinkUnfurl } from './unfurl.mts'

type AmexCardSlug = Awaited<ReturnType<typeof getAmexCardSlugCatalog>>[number]

describe('runReferralLinkUnfurl', () => {
  let parentProgramId: string
  let parentHostname: string

  beforeAll(async () => {
    const creator = await createTestUserDirect()
    const fixture = await createReferralProgramFixture({ createdById: creator!.id })
    parentProgramId = fixture.referralProgramId
    parentHostname = fixture.hostname
  })

  async function createPlusOwner(): Promise<PrivateUser> {
    const user = await createTestUserDirect()
    await createTestMembership({ user_id: user!.id, plan: 'plus' })
    return user!
  }

  async function createParentLink(owner: PrivateUser, labelSuffix: string) {
    return createUserReferralLink(owner, WEB_PROVENANCE, {
      user_id: owner.id,
      referral_program_id: parentProgramId,
      url: `https://${parentHostname}/ref/${randomSlug(labelSuffix)}`,
      label: `parent-${labelSuffix}`,
    })
  }

  async function createAmexCardFixture(owner: { id: string }, card: AmexCardSlug) {
    return createReferralProgramFixture({
      createdById: owner.id,
      hostname: 'www.americanexpress.com',
      pathname: `/en-us/referral/${card.kind}/${card.slug}`,
    })
  }

  function randomSlug(label: string): string {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  function stubCrawl(finalUrl: string) {
    const spy = vi.spyOn(browserCrawl, 'crawlWithBrowser').mockResolvedValue({
      statusCode: 200,
      hasContent: true,
      title: 'stub',
      contentLength: 1,
      finalUrl,
    })
    onTestFinished(() => spy.mockRestore())
    return spy
  }

  function stubCrawlThrows(error: Error) {
    const spy = vi.spyOn(browserCrawl, 'crawlWithBrowser').mockRejectedValue(error)
    onTestFinished(() => spy.mockRestore())
    return spy
  }

  /** Answers the global catalog read with exactly these cards; the production parser still runs. */
  function answerCatalog(...catalogs: AmexCardSlug[][]) {
    onTestFinished(
      answerPostgresReadsForTest(
        '/* getAmexCardSlugCatalog */',
        catalogs.map(cards =>
          cards.map(card => ({ pathname: `/en-us/referral/${card.kind}/${card.slug}%` })),
        ),
      ),
    )
  }

  it('happy path: creates one child per catalog card and marks the parent completed', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'happy')
    const cards: AmexCardSlug[] = [
      { kind: 'personal', slug: randomSlug('gold') },
      { kind: 'personal', slug: randomSlug('platinum') },
      { kind: 'business', slug: randomSlug('biz-gold') },
    ]
    await Promise.all(cards.map(card => createAmexCardFixture(owner, card)))
    const finalUrl = `https://redirected.example.com/landed?corid=${randomSlug('corid')}`
    const crawl = stubCrawl(finalUrl)
    answerCatalog(cards)
    await runReferralLinkUnfurl(parent.id)
    expect(crawl).toHaveBeenCalledOnce()
    const updated = await getUserReferralLink(parent.id)
    expect(updated?.unfurl_completed_at).toBeTruthy()
    expect(updated?.unfurl_failed_at).toBeNull()
    const ownedUrls = await Promise.all(
      constructChildUrls(finalUrl, cards).map(url => addUrl(owner.id, url)),
    )
    const childIds = await getActiveChildUrlIdsForTest(parent.id)
    expect(childIds).toHaveLength(cards.length)
    expect(childIds).toEqual(expect.arrayContaining(ownedUrls.map(url => url!.id)))
  })
  it('no-ops for a missing parent link id, never crawling', async () => {
    const crawl = stubCrawl('https://example.com/never-used')

    await expect(runReferralLinkUnfurl(randomUUID())).resolves.toBeUndefined()

    expect(crawl).not.toHaveBeenCalled()
  })

  it('no-ops for a soft-deleted parent link, never crawling', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'deleted')
    await deleteUserReferralLink(owner, parent.id)
    const crawl = stubCrawl('https://example.com/never-used')

    await expect(runReferralLinkUnfurl(parent.id)).resolves.toBeUndefined()

    expect(crawl).not.toHaveBeenCalled()
  })

  it('no-ops when the given id is itself a child link, never crawling', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'child-target')
    const card: AmexCardSlug = { kind: 'personal', slug: randomSlug('child-target-card') }
    const cardFixture = await createAmexCardFixture(owner, card)
    const [childUrl] = constructChildUrls('https://redirected.example.com/landed?x=1', [card])
    const child = (
      await createChildReferralLinks(owner.id, WEB_PROVENANCE, [
        {
          userId: owner.id,
          referralProgramId: cardFixture.referralProgramId,
          url: childUrl,
          parentLinkId: parent.id,
          label: 'existing child',
        },
      ])
    )[0]!
    const crawl = stubCrawl('https://example.com/never-used')

    await expect(runReferralLinkUnfurl(child.id)).resolves.toBeUndefined()

    expect(crawl).not.toHaveBeenCalled()
  })

  it('fails without crawling when the owner no longer has an active Plus/Pro membership', async () => {
    const owner = await createTestUserDirect()
    const parent = await createParentLink(owner!, 'downgraded')
    const crawl = stubCrawl('https://example.com/never-used')

    await runReferralLinkUnfurl(parent.id)

    expect(crawl).not.toHaveBeenCalled()
    const updated = await getUserReferralLink(parent.id)
    expect(updated?.unfurl_failed_at).toBeTruthy()
    expect(updated?.unfurl_last_error).toBe('Owner no longer has an active Plus/Pro membership')
    expect(updated?.unfurl_completed_at).toBeNull()
  })

  it('marks the parent failed and rethrows when the crawl throws', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'crawl-fails')
    stubCrawlThrows(suppressedError('boom'))

    await expect(runReferralLinkUnfurl(parent.id)).rejects.toThrow('boom')

    const updated = await getUserReferralLink(parent.id)
    expect(updated?.unfurl_failed_at).toBeTruthy()
    expect(updated?.unfurl_last_error).toBe('Crawl failed: boom')
    expect(updated?.unfurl_completed_at).toBeNull()
  })

  it('marks the parent failed without throwing when child URL construction fails', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'construct-fails')
    stubCrawl('https://redirected.example.com/landed?x=1')
    onTestFinished(
      rejectPostgresReadForTest('/* getAmexCardSlugCatalog */', suppressedError('catalog boom')),
    )

    await expect(runReferralLinkUnfurl(parent.id)).resolves.toBeUndefined()

    const updated = await getUserReferralLink(parent.id)
    expect(updated?.unfurl_failed_at).toBeTruthy()
    expect(updated?.unfurl_last_error).toBe('Failed to construct child URLs: catalog boom')
    expect(updated?.unfurl_completed_at).toBeNull()
  })

  it('fails with a zero-candidates message and leaves the parent otherwise untouched', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'zero-candidates')
    stubCrawl('https://redirected.example.com/landed?x=1')
    answerCatalog([])

    await runReferralLinkUnfurl(parent.id)

    const updated = await getUserReferralLink(parent.id)
    expect(updated).toBeTruthy()
    expect(updated?.deleted_at).toBeNull()
    expect(updated?.unfurl_failed_at).toBeTruthy()
    expect(updated?.unfurl_last_error).toBe(
      'No per-card referral URLs resolved from the crawled page',
    )
    expect(updated?.unfurl_completed_at).toBeNull()
  })

  it('reconciles across two runs: a dropped card is soft-deleted, a kept card is not duplicated', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'reconcile')
    const cardKeep: AmexCardSlug = { kind: 'personal', slug: randomSlug('keep') }
    const cardDrop: AmexCardSlug = { kind: 'business', slug: randomSlug('drop') }
    await Promise.all([
      createAmexCardFixture(owner, cardKeep),
      createAmexCardFixture(owner, cardDrop),
    ])
    const finalUrl = `https://redirected.example.com/landed?corid=${randomSlug('corid')}`
    const [keepUrl] = constructChildUrls(finalUrl, [cardKeep])
    const [dropUrl] = constructChildUrls(finalUrl, [cardDrop])
    const keepUrlRecord = await addUrl(owner.id, keepUrl)
    const dropUrlRecord = await addUrl(owner.id, dropUrl)

    stubCrawl(finalUrl)
    answerCatalog([cardKeep, cardDrop], [cardKeep])

    await runReferralLinkUnfurl(parent.id)

    const idsAfterRun1 = await getActiveChildUrlIdsForTest(parent.id)
    expect(idsAfterRun1).toHaveLength(2)
    expect(idsAfterRun1).toEqual(expect.arrayContaining([keepUrlRecord!.id, dropUrlRecord!.id]))

    await runReferralLinkUnfurl(parent.id)

    const idsAfterRun2 = await getActiveChildUrlIdsForTest(parent.id)
    expect(idsAfterRun2).toEqual([keepUrlRecord!.id])

    const updated = await getUserReferralLink(parent.id)
    expect(updated?.unfurl_completed_at).toBeTruthy()
  })

  it('skips a card that collides with an existing manual link, still creating the others', async () => {
    const owner = await createPlusOwner()
    const parent = await createParentLink(owner, 'manual-collision')
    const cardConflict: AmexCardSlug = { kind: 'personal', slug: randomSlug('conflict') }
    const cardOk: AmexCardSlug = { kind: 'personal', slug: randomSlug('ok') }
    const [conflictFixture] = await Promise.all([
      createAmexCardFixture(owner, cardConflict),
      createAmexCardFixture(owner, cardOk),
    ])
    const finalUrl = `https://redirected.example.com/landed?corid=${randomSlug('corid')}`
    const [conflictUrl] = constructChildUrls(finalUrl, [cardConflict])
    const [okUrl] = constructChildUrls(finalUrl, [cardOk])

    const manualLink = await createUserReferralLink(owner, WEB_PROVENANCE, {
      user_id: owner.id,
      referral_program_id: conflictFixture.referralProgramId,
      url: conflictUrl,
      label: 'manually added',
    })

    stubCrawl(finalUrl)
    answerCatalog([cardConflict, cardOk])

    await runReferralLinkUnfurl(parent.id)

    const updatedParent = await getUserReferralLink(parent.id)
    expect(updatedParent?.unfurl_completed_at).toBeTruthy()
    expect(updatedParent?.unfurl_failed_at).toBeNull()

    const okUrlRecord = await addUrl(owner.id, okUrl)
    const childIds = await getActiveChildUrlIdsForTest(parent.id)
    expect(childIds).toEqual([okUrlRecord!.id])

    const manualLinkAfter = await getUserReferralLink(manualLink.id)
    expect(manualLinkAfter?.parent_link_id).toBeNull()
    expect(manualLinkAfter?.deleted_at).toBeNull()
  })
})
