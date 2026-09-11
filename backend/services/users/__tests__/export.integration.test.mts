import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
import { parseCsvRows } from '@modules/csv'
import {
  createTestUser,
  insertEntityRelation,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { updateUserFields } from '../update-fields.mts'
import { grantConsent } from '@services/user-consents/create'
import { writeExportFiles } from '@services/account-data-requests/export'

describe('writeExportFiles', () => {
  it('creates all expected CSV files for a user with an email address', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user to be created')

    const parentDir = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    const exportDir = join(parentDir, 'export')
    try {
      await writeExportFiles(user.id, exportDir)

      const files = await readdir(exportDir)
      expect(files).toContain('profile.csv')
      expect(files).toContain('posts.csv')
      expect(files).toContain('votes.csv')
      expect(files).toContain('emails.csv')
      expect(files).toContain('phones.csv')
      expect(files).toContain('oauth-accounts.csv')
      expect(files).toContain('passkeys.csv')
      expect(files).toContain('consents.csv')
      expect(files).toContain('referral-attributions.csv')
      expect(files).toContain('followed-rss-feeds.csv')
      expect(files).toContain('followed-topics.csv')
      expect(files).toContain('bookmarks.csv')
      expect(files).toContain('entity-relations.csv')
    } finally {
      await rm(parentDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('emails.csv contains the user email row', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user to be created')

    const parentDir = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    const exportDir = join(parentDir, 'export')
    try {
      await writeExportFiles(user.id, exportDir)

      const emailsCsv = await readFile(join(exportDir, 'emails.csv'), 'utf8')
      expect(emailsCsv).toContain('email_address')
      expect(emailsCsv).toContain('voucha.ai')
    } finally {
      await rm(parentDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('profile.csv contains every privacy and processing control', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user to be created')

    const restrictionStartedAfterMs = Date.now()
    await updateUserFields(user.id, {
      topic_follows_visibility: 'followers',
      rss_feed_follows_visibility: 'mutual_followers',
      community_memberships_visibility: 'nobody',
      direct_messages_audience: 'users',
      processing_restricted_at: true,
      third_party_marketing: true,
      hn_discussions: true,
      country: 'us',
      ui_locale: 'EN_us',
    })

    const parentDir = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    const exportDir = join(parentDir, 'export')
    try {
      await writeExportFiles(user.id, exportDir)

      const profileCsv = await readFile(join(exportDir, 'profile.csv'), 'utf8')
      const profile = readSingleRowCsv(profileCsv)
      expect(profile).toMatchObject({
        topic_follows_visibility: 'followers',
        rss_feed_follows_visibility: 'mutual_followers',
        community_memberships_visibility: 'nobody',
        direct_messages_audience: 'users',
        third_party_marketing: 'true',
        hn_discussions: 'true',
        country: 'US',
        ui_locale: 'en',
      })
      expect(profile.processing_restricted_at).toMatch(/^\d{13}$/)
      const processingRestrictedAtMs = Number(profile.processing_restricted_at)
      expect(processingRestrictedAtMs).toBeGreaterThanOrEqual(restrictionStartedAfterMs)
      expect(processingRestrictedAtMs).toBeLessThanOrEqual(Date.now())
    } finally {
      await rm(parentDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('profile.csv exports explicitly disabled third-party marketing as false', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user to be created')

    await updateUserFields(user.id, {
      third_party_marketing: false,
    })

    const parentDir = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    const exportDir = join(parentDir, 'export')
    try {
      await writeExportFiles(user.id, exportDir)

      const profileCsv = await readFile(join(exportDir, 'profile.csv'), 'utf8')
      const profile = readSingleRowCsv(profileCsv)
      expect(profile.third_party_marketing).toBe('false')
    } finally {
      await rm(parentDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('consents.csv contains legal consent ledger rows', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user to be created')
    await grantConsent(user.id, 'privacy_policy', 'export-test-privacy-v1')
    await grantConsent(user.id, 'privacy_policy', 'export-test-privacy-v2')
    await grantConsent(user.id, 'terms_of_service', 'export-test-terms-v1')

    const parentDir = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    const exportDir = join(parentDir, 'export')
    try {
      await writeExportFiles(user.id, exportDir)

      const consentsCsv = await readFile(join(exportDir, 'consents.csv'), 'utf8')
      const consents = parseCsvRows(consentsCsv)
      const activeConsentTypes = consents
        .filter(consent => consent.revoked_at === '')
        .map(consent => consent.consent_type)
      const revokedPrivacyConsent = consents.find(
        consent =>
          consent.consent_type === 'privacy_policy' && consent.version === 'export-test-privacy-v1',
      )

      expect(activeConsentTypes).toContain('privacy_policy')
      expect(activeConsentTypes).toContain('terms_of_service')
      expect(consents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            consent_type: 'privacy_policy',
            version: 'export-test-privacy-v2',
            created_at: expect.stringMatching(/^\d{13}$/),
            revoked_at: '',
          }),
          expect.objectContaining({
            consent_type: 'terms_of_service',
            version: 'export-test-terms-v1',
            created_at: expect.stringMatching(/^\d{13}$/),
            revoked_at: '',
          }),
        ]),
      )
      expect(revokedPrivacyConsent).toMatchObject({
        consent_type: 'privacy_policy',
        version: 'export-test-privacy-v1',
        created_at: expect.stringMatching(/^\d{13}$/),
        revoked_at: expect.stringMatching(/^\d{13}$/),
      })
    } finally {
      await rm(parentDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('followed export CSVs contain followed topic and RSS feed details', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user to be created')
    const topicName = `Account Export Followed Topic ${Math.random().toString(36).slice(2)}`
    const topicId = await insertTestTopic({
      name: topicName,
      slug: `account-export-followed-topic-${Math.random().toString(36).slice(2)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: 'Account Export Feed',
      rssFeedUrl: `https://account-export-feed-${Math.random().toString(36).slice(2)}.example.com/feed.xml`,
    })
    await insertEntityRelation('relation__user__follow__topic', user.id, topicId)
    await insertEntityRelation('relation__user__follow__rss_feed', user.id, feedId)

    const parentDir = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    const exportDir = join(parentDir, 'export')
    try {
      await writeExportFiles(user.id, exportDir)

      const topicsCsv = await readFile(join(exportDir, 'followed-topics.csv'), 'utf8')
      const feedsCsv = await readFile(join(exportDir, 'followed-rss-feeds.csv'), 'utf8')
      expect(topicsCsv).toContain(topicName)
      expect(feedsCsv).toContain('Account Export Feed')
      expect(feedsCsv).toContain('account-export-feed-')
    } finally {
      await rm(parentDir, { recursive: true, force: true })
    }
  }, 30_000)
})

function readSingleRowCsv(csv: string): Record<string, string> {
  const rows = parseCsvRows(csv)
  if (rows.length !== 1) throw new Error(`Expected one CSV data row, got ${rows.length}`)
  return rows[0]!
}
