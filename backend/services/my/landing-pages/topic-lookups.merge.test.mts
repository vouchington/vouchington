import { describe, expect, it } from 'vitest'
import {
  createTestReferralProgramLink,
  createTestUser,
  enableReferralProgramByTopicId,
  insertTestTopic,
} from '@voucha/test-helpers'
import { getTopicByAny } from '../../topics/get.mts'
import { mergeTopicAliases } from '../../topics/merge-aliases.mts'
import {
  getLandingPageReferralLinksByIds,
  getLandingPageTopicsByIds,
  getOwnedLandingPageReferralLinks,
} from './topic-lookups.mts'

describe('landing page topic lookup after merges', () => {
  it('reads canonical persisted referral owners and excludes merged IDs from direct topic lookups', async () => {
    const user = await createTestUser({ administrator: true })
    const sourceId = await insertTestTopic({
      name: `Landing source ${crypto.randomUUID()}`,
      slug: `landing-source-${crypto.randomUUID()}`,
      createdById: user.id,
      topicType: 'referral_program',
    })
    const destinationId = await insertTestTopic({
      name: `Landing destination ${crypto.randomUUID()}`,
      slug: `landing-destination-${crypto.randomUUID()}`,
      createdById: user.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(sourceId)
    await enableReferralProgramByTopicId(destinationId)
    const linkId = await createTestReferralProgramLink({
      userId: user.id,
      referralProgramId: sourceId,
      url: `https://example.com/landing-${crypto.randomUUID()}`,
      label: 'Referral',
    })
    const [source, destination] = await Promise.all([
      getTopicByAny(sourceId),
      getTopicByAny(destinationId),
    ])
    if (!source || !destination) throw new Error('Landing topic fixture missing')
    await mergeTopicAliases(user, source, destination)
    const [selected, owned, topics] = await Promise.all([
      getLandingPageReferralLinksByIds(user.id, [linkId], false),
      getOwnedLandingPageReferralLinks(user.id),
      getLandingPageTopicsByIds([sourceId, destinationId]),
    ])
    expect(selected.get(linkId)).toMatchObject({
      referral_program_id: destinationId,
      referral_program_slug: destination.slug,
    })
    expect(owned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: linkId, referral_program_id: destinationId }),
      ]),
    )
    expect([...topics.keys()]).toEqual([destinationId])
  })
})
