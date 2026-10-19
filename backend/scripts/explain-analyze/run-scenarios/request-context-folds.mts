import { beginTransaction } from '@data-stores/psql'
import { loadCommunityWithViewer } from '@services/communities/load-with-viewer'
import { updateCommunity } from '@services/communities/update'
import { getActiveCommunityMembersForUsers } from '@services/communities/members/batch'
import { lockCommunityRestrictionWrites } from '@services/communities/restrictions/lock'
import { canViewPostsBatch } from '@services/posts/check-privacy-access-batch'
import { getPostByAny } from '@services/posts/get'
import { createTopic, readCreatedTopic } from '@services/topics/create'
import { getTopicByAny } from '@services/topics/get'
import { addUrl } from '@services/urls/upsert'
import { updateUserFields } from '@services/users/update-fields'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const topicSlug = 'seed-explain-request-fold'
const foldProvenance = { createdVia: 'web' as const, oauthClientId: null }

export async function runRequestContextFoldScenarios(): Promise<void> {
  await runPostVisibilityBatch()
  await runCommunityMembersForUsers()
  await runCommunityUpdateReturning()
  await runUrlUpsertHydration()
  await runTopicCreateReturning()
  await runCommunityRestrictionLock()
  await runUserUpdateReturning()
}

async function runPostVisibilityBatch(): Promise<void> {
  registerScenarioContract('post-visibility-batch', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 5 }],
  })
  const second = await getPostByAny(seedUuid(1, '05'))
  const first = await getPostByAny(seedPostId)
  if (!first || !second) throw new Error('Seeded posts are required')
  await runAndCapture(
    'post-visibility-batch',
    async () => {
      const visible = await canViewPostsBatch(null, [first, second])
      if (!visible.get(first.id) || !visible.get(second.id))
        throw new Error('Seeded posts must stay visible to an anonymous reader')
    },
    undefined,
    'canViewPostsBatch',
  )
}

async function runCommunityMembersForUsers(): Promise<void> {
  registerScenarioContract('community-members-for-users', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'community_members', max: 3 }],
  })
  const loaded = await loadCommunityWithViewer('seed-community-0', seedUser.id)
  await runAndCapture(
    'community-members-for-users',
    async () => {
      const members = await getActiveCommunityMembersForUsers(loaded.community.id, [
        seedUser.id,
        seedUuid(1, '01'),
      ])
      if (!members.get(seedUser.id)) throw new Error('Seeded owner must be an active member')
    },
    undefined,
    'getActiveCommunityMembersForUsers',
  )
}

async function runCommunityUpdateReturning(): Promise<void> {
  registerScenarioContract('community-update-returning', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'communities', max: 3 },
      { kind: 'maxProcessedRows', relation: 'users', max: 3 },
    ],
  })
  const loaded = await loadCommunityWithViewer('seed-community-0', seedUser.id)
  await runAndCapture(
    'community-update-returning',
    async () => {
      await using transaction = await beginTransaction()
      const updated = await updateCommunity(
        seedUser,
        loaded.community.id,
        { name: loaded.community.name },
        loaded.membership,
        { query: transaction, community: loaded.community },
      )
      if (updated.id !== loaded.community.id)
        throw new Error('Update must return the same community')
    },
    undefined,
    'updateCommunity',
  )
}

async function runUrlUpsertHydration(): Promise<void> {
  registerScenarioContract('url-upsert-hydration', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'urls', max: 2 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
    ],
  })
  await runAndCapture(
    'url-upsert-hydration',
    async () => {
      const url = await addUrl(seedUser.id, 'https://www.seed-host-0.example.com/request-fold')
      if (!url?.hostname.id) throw new Error('Upsert must return the hydrated URL')
    },
    undefined,
    'addUrls',
  )
}

async function runTopicCreateReturning(): Promise<void> {
  registerScenarioContract('topic-create-returning', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
    ],
  })
  const admin = { ...seedUser, roles: ['administrator'] } as PrivateUser
  let topicId = (await getTopicByAny(topicSlug))?.id
  if (!topicId) {
    topicId = (
      await createTopic(admin, foldProvenance, { name: 'Seed fold topic', slug: topicSlug })
    ).id
  }
  await runAndCapture(
    'topic-create-returning',
    async () => {
      const topic = await readCreatedTopic(topicId)
      if (topic.slug !== topicSlug) throw new Error('Created topic must keep its slug')
    },
    undefined,
    'createTopicReturning',
  )
}

async function runCommunityRestrictionLock(): Promise<void> {
  registerScenarioContract('community-restriction-lock', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'communities', max: 2 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 2 },
      { kind: 'maxProcessedRows', relation: 'users', max: 3 },
    ],
  })
  const loaded = await loadCommunityWithViewer('seed-community-0', seedUser.id)
  await runAndCapture(
    'community-restriction-lock',
    async () => {
      await using transaction = await beginTransaction()
      const locked = await lockCommunityRestrictionWrites(
        transaction,
        loaded.community.id,
        seedUser.id,
      )
      if (locked.archived_at) throw new Error('Seed community must stay unarchived')
    },
    undefined,
    'lockCommunityRestrictionWrites',
  )
}

async function runUserUpdateReturning(): Promise<void> {
  registerScenarioContract('user-update-returning', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'users', max: 3 }],
  })
  const before = await getPrivateUserByAny(seedUser.id)
  if (!before) throw new Error('Seed user must exist')
  await runAndCapture(
    'user-update-returning',
    async () => {
      const updated = await updateUserFields(seedUser.id, { ui_locale: 'en' })
      if (!updated || updated.id !== seedUser.id)
        throw new Error('User update must return the actor')
    },
    undefined,
    'updateUserFields',
    {
      afterCapture: async () => {
        await updateUserFields(seedUser.id, { ui_locale: before.ui_locale })
      },
    },
  )
}
