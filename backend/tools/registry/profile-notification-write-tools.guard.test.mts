import { afterEach, describe, expect, it } from 'vitest'
import { notifications } from '@queues/notifications/queues'
import {
  createTestUser,
  insertTestImage,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { createFollowNotification, listNotifications } from '@services/notifications'
import { getProfile } from '@services/my/profile'
import { createProfileLink, listProfileLinks } from '@services/my/profile-links'
import { getEmailPreferences, getPrivateUserByAny } from '@services/users'
import type { ApiScope } from '@modules/scopes'
import { SETTING_FIELDS } from '../preference-tool-support.mts'

type Fixture = Awaited<ReturnType<typeof createFixture>>

const PROFILE: ApiScope[] = ['profile:read', 'profile:write']
const NOTIFICATIONS: ApiScope[] = ['notifications:read', 'notifications:write']
const PREFERENCES: ApiScope[] = ['preferences:read', 'preferences:write']

// Every tool, with arguments that would change something for the fixture user.
const TOOLS: [string, ApiScope[], (fixture: Fixture) => Record<string, unknown>][] = [
  ['update_my_bio', PROFILE, () => ({ markdown: 'Changed' })],
  ['add_my_profile_link', PROFILE, () => ({ link_type: 'url', url: 'https://example.com/new' })],
  ['update_my_profile_link', PROFILE, f => ({ link_id: f.linkIds[0], name: 'Changed' })],
  ['delete_my_profile_link', PROFILE, f => ({ link_id: f.linkIds[0] })],
  ['reorder_my_profile_links', PROFILE, f => ({ ids: [...f.linkIds].toReversed() })],
  ['update_my_display_identity', PROFILE, f => ({ profile_image_id: f.imageId })],
  ['mark_notification_read', NOTIFICATIONS, f => ({ notification_id: f.notificationId })],
  ['mark_all_notifications_read', NOTIFICATIONS, () => ({})],
  ['delete_notification', NOTIFICATIONS, f => ({ notification_id: f.notificationId })],
  ['update_my_email_preferences', PREFERENCES, () => ({ news_digest_frequency: 'weekly' })],
  ['update_my_preferences', PREFERENCES, () => ({ follows_visibility: 'nobody' })],
]

async function createFixture(plan: 'plus' | null = 'plus') {
  const caller = { ...(await createTestUser()), membership_plan: plan }
  const actor = await createTestUser()
  const [notification] = await createFollowNotification(caller.id, actor.id, actor.username)
  const links = await Promise.all(
    ['one', 'two'].map(name =>
      createProfileLink(caller.id, { link_type: 'url', url: `https://example.com/${name}` }),
    ),
  )
  return {
    caller,
    notificationId: notification!.id,
    linkIds: links.map(link => link.id),
    imageId: await insertTestImage(caller.id),
  }
}

// Everything the tools can change, read from the primary.
async function snapshot(userId: string) {
  const user = (await getPrivateUserByAny(userId, { readOnly: false })) as Record<string, unknown>
  const jobs = await readAllQueueJobs(notifications)
  return {
    bio: await getProfile(userId),
    links: await listProfileLinks(userId),
    notifications: (await listNotifications(userId)).results.map(row => [row.id, row.read_at]),
    queuedDeletions: jobs.filter(
      job =>
        job.name === 'processDeleteNotification' &&
        (job.data as { userId?: string }).userId === userId,
    ).length,
    emailPreferences: await getEmailPreferences(userId),
    settings: SETTING_FIELDS.map(field => user[field]),
    identity: [user.use_display_name_from, user.profile_image_id],
  }
}

describe('profile, notification and preference write tools guards — real DB', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each(TOOLS)('%s refuses a read-only grant before any change', async (name, scopes, args) => {
    const fixture = await createFixture()
    const before = await snapshot(fixture.caller.id)

    expect(
      await callRejectedMcpTool(
        fixture.caller,
        name,
        args(fixture),
        scopes.filter(scope => scope.endsWith(':read')),
      ),
    ).toContain('Tool requires scopes')

    expect(await snapshot(fixture.caller.id)).toEqual(before)
  })

  it.each(TOOLS)('%s refuses a free plan before any change', async (name, scopes, args) => {
    const fixture = await createFixture(null)
    const before = await snapshot(fixture.caller.id)

    expect(await callRejectedMcpTool(fixture.caller, name, args(fixture), scopes)).toContain(
      'requires a higher plan',
    )

    expect(await snapshot(fixture.caller.id)).toEqual(before)
  })

  it.each(TOOLS)('%s refuses a suspended user before any change', async (name, scopes, args) => {
    const fixture = await createFixture()
    const before = await snapshot(fixture.caller.id)
    await suspendTestUser(fixture.caller.id)
    suspendedUserIds.push(fixture.caller.id)

    await callRejectedMcpTool(fixture.caller, name, args(fixture), scopes)

    expect(await snapshot(fixture.caller.id)).toEqual(before)
  })

  it.each(TOOLS)('%s refuses an argument naming another user', async (name, scopes, args) => {
    const fixture = await createFixture()
    const before = await snapshot(fixture.caller.id)

    expect(
      await callRejectedMcpTool(
        fixture.caller,
        name,
        { ...args(fixture), user_id: crypto.randomUUID() },
        scopes,
      ),
    ).toContain('Invalid tool arguments')

    expect(await snapshot(fixture.caller.id)).toEqual(before)
  })
})
