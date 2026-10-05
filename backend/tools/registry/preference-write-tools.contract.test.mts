import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestImage } from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { getEmailPreferences, getPrivateUserByAny } from '@services/users'
import { SETTING_FIELDS } from '../preference-tool-support.mts'

const EMAIL_SCOPES = ['preferences:read', 'preferences:write'] as const
const IDENTITY_SCOPES = ['profile:read', 'profile:write'] as const

const privateUser = (id: string) => getPrivateUserByAny(id, { readOnly: false })

async function createCaller() {
  return { ...(await createTestUser()), membership_plan: 'plus' as const }
}

describe('email preference tool contract — real DB', () => {
  it('update_my_email_preferences returns what PATCH /api/v1/my/email-preferences returns', async () => {
    const caller = await createCaller()
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    const rest = await request
      .patch('/api/v1/my/email-preferences')
      .set('Content-Type', 'application/json')
      .send({ news_digest_frequency: 'weekly', moderation_email_days_of_week: [3, 1, 3] })
      .expect(200)

    const result = await callStructuredMcpTool(
      caller,
      'update_my_email_preferences',
      { news_digest_frequency: 'weekly', moderation_email_days_of_week: [3, 1, 3] },
      EMAIL_SCOPES,
    )

    expect(result).toEqual({ success: true, email_preferences: rest.body.email_preferences })
    expect(await getEmailPreferences(caller.id)).toEqual(result.email_preferences)
  })

  it('changes only the fields sent', async () => {
    const caller = await createCaller()
    const before = await getEmailPreferences(caller.id)

    await callStructuredMcpTool(
      caller,
      'update_my_email_preferences',
      { community_digest_frequency: 'daily', moderation_email_timezone: 'America/New_York' },
      EMAIL_SCOPES,
    )
    const second = await callStructuredMcpTool(
      caller,
      'update_my_email_preferences',
      { is_engagement_emails_enabled: !before.is_engagement_emails_enabled },
      EMAIL_SCOPES,
    )

    expect(second.email_preferences).toEqual({
      ...before,
      is_engagement_emails_enabled: !before.is_engagement_emails_enabled,
      community_digest_frequency: 'daily',
      moderation_email_timezone: 'America/New_York',
    })
  })

  it.each([
    ['nothing to change', {}],
    ['an unknown field', { news_digest_frequency: 'daily', email: 'tests+b11e0c@voucha.ai' }],
    ['another user', { news_digest_frequency: 'daily', user_id: crypto.randomUUID() }],
    ['a frequency that is not offered', { news_digest_frequency: 'hourly' }],
    ['a cadence that is not offered', { moderation_email_cadence: 'monthly' }],
    ['a time that is not HH:MM', { moderation_email_time_of_day: '25:00' }],
    ['a weekday out of range', { moderation_email_days_of_week: [8] }],
    ['no weekdays', { moderation_email_days_of_week: [] }],
    ['a null time zone', { moderation_email_timezone: null }],
    ['a time zone over 64 characters', { moderation_email_timezone: 'z'.repeat(65) }],
  ])('refuses %s before any change', async (_, args) => {
    const caller = await createCaller()
    const before = await getEmailPreferences(caller.id)

    expect(
      await callRejectedMcpTool(caller, 'update_my_email_preferences', args, EMAIL_SCOPES),
    ).toContain('Invalid tool arguments')

    expect(await getEmailPreferences(caller.id)).toEqual(before)
  })

  it('refuses a time zone the service does not know, as the REST route does', async () => {
    const caller = await createCaller()
    const before = await getEmailPreferences(caller.id)

    expect(
      await callRejectedMcpTool(
        caller,
        'update_my_email_preferences',
        { moderation_email_timezone: 'Not/AZone' },
        EMAIL_SCOPES,
      ),
    ).toContain('moderation_email_timezone must be a valid timezone string')

    expect(await getEmailPreferences(caller.id)).toEqual(before)
  })
})

describe('preferences tool contract — real DB', () => {
  it('update_my_preferences applies the REST route’s command and returns every setting', async () => {
    const caller = await createCaller()
    const other = await createTestUser()
    const args = {
      follows_visibility: 'nobody',
      direct_messages_audience: 'followers',
      default_post_privacy: 'private',
      country: 'ca',
      should_import_hacker_news_discussions: false,
    }
    const request = createRequest()
    await request.authenticateAs(other)
    const rest = await request
      .patch(`/api/v1/users/${other.id}`)
      .set('Content-Type', 'application/json')
      .send(args)
      .expect(200)

    const result = await callStructuredMcpTool(caller, 'update_my_preferences', args, EMAIL_SCOPES)

    expect(Object.keys(result.settings as object).toSorted()).toEqual(
      [...SETTING_FIELDS].toSorted(),
    )
    for (const field of SETTING_FIELDS) {
      expect((result.settings as Record<string, unknown>)[field]).toEqual(
        rest.body.user[field] ?? null,
      )
    }
    expect(result.settings).toMatchObject({
      follows_visibility: 'nobody',
      country: 'CA',
      should_import_hacker_news_discussions: false,
    })
    expect((await privateUser(caller.id))?.follows_visibility).toBe('nobody')
  })

  it('changes only the fields sent and clears a locale with null', async () => {
    const caller = await createCaller()
    await callStructuredMcpTool(
      caller,
      'update_my_preferences',
      { likes_visibility: 'followers', country: 'US' },
      EMAIL_SCOPES,
    )

    const result = await callStructuredMcpTool(
      caller,
      'update_my_preferences',
      { country: null },
      EMAIL_SCOPES,
    )

    expect(result.settings).toMatchObject({ likes_visibility: 'followers', country: null })
  })

  it.each([
    ['nothing to change', {}],
    ['an unknown field', { country: 'US', username: 'someone-else' }],
    ['a financial-data setting', { cards_visibility: 'everyone' }],
    ['a consent', { processing_restricted: true }],
    ['an audience that is not offered', { follows_visibility: 'friends' }],
    ['a broadcast that is not offered', { default_post_broadcast: 'nobody' }],
    ['a non-boolean toggle', { should_import_hacker_news_discussions: 'yes' }],
  ])('refuses %s before any change', async (_, args) => {
    const caller = await createCaller()
    const before = await privateUser(caller.id)

    expect(
      await callRejectedMcpTool(caller, 'update_my_preferences', args, EMAIL_SCOPES),
    ).toContain('Invalid tool arguments')

    expect(await privateUser(caller.id)).toEqual(before)
  })

  it('refuses a country the service does not know, as the REST route does', async () => {
    const caller = await createCaller()

    expect(
      await callRejectedMcpTool(caller, 'update_my_preferences', { country: 'ZZZ' }, EMAIL_SCOPES),
    ).toContain('Invalid country')
  })
})

describe('display identity tool contract — real DB', () => {
  it('update_my_display_identity sets and clears the avatar, and returns both fields', async () => {
    const caller = await createCaller()
    const imageId = await insertTestImage(caller.id)

    const set = await callStructuredMcpTool(
      caller,
      'update_my_display_identity',
      { use_display_name_from: 'username', profile_image_id: imageId },
      IDENTITY_SCOPES,
    )
    const cleared = await callStructuredMcpTool(
      caller,
      'update_my_display_identity',
      { profile_image_id: null },
      IDENTITY_SCOPES,
    )

    expect(set.identity).toEqual({ use_display_name_from: 'username', profile_image_id: imageId })
    expect(cleared.identity).toEqual({ use_display_name_from: 'username', profile_image_id: null })
  })

  it('matches PATCH /api/v1/my/identity for the same change', async () => {
    const caller = await createCaller()
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    const rest = await request
      .patch('/api/v1/my/identity')
      .set('Content-Type', 'application/json')
      .send({ use_display_name_from: 'username' })
      .expect(200)

    const result = await callStructuredMcpTool(
      caller,
      'update_my_display_identity',
      { use_display_name_from: 'username' },
      IDENTITY_SCOPES,
    )

    expect((result.identity as { use_display_name_from: string }).use_display_name_from).toBe(
      rest.body.identity.use_display_name_from,
    )
  })

  it('refuses an image another user uploaded and keeps the avatar', async () => {
    const caller = await createCaller()
    const owner = await createTestUser()
    const foreign = await insertTestImage(owner.id)
    const own = await insertTestImage(caller.id)
    await callStructuredMcpTool(
      caller,
      'update_my_display_identity',
      { profile_image_id: own },
      IDENTITY_SCOPES,
    )

    expect(
      await callRejectedMcpTool(
        caller,
        'update_my_display_identity',
        { profile_image_id: foreign },
        IDENTITY_SCOPES,
      ),
    ).toContain('Image not found or does not belong to you')

    expect((await privateUser(caller.id))?.profile_image_id).toBe(own)
    expect((await privateUser(owner.id))?.profile_image_id ?? null).toBeNull()
  })

  it.each([
    ['nothing to change', {}],
    ['a username', { username: 'someone-else' }],
    ['an unknown sign-in source', { use_display_name_from: 'myspace' }],
    ['an image id that is not a uuid', { profile_image_id: 'nope' }],
    ['another user', { profile_image_id: null, user_id: crypto.randomUUID() }],
  ])('refuses %s before any change', async (_, args) => {
    const caller = await createCaller()
    const before = await privateUser(caller.id)

    expect(
      await callRejectedMcpTool(caller, 'update_my_display_identity', args, IDENTITY_SCOPES),
    ).toContain('Invalid tool arguments')

    expect(await privateUser(caller.id)).toEqual(before)
  })
})
