import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers'
import {
  createReferralLinkValidation,
  getReferralLinkValidationBySlug,
  updateReferralLinkValidation,
  deleteReferralLinkValidation,
  listReferralLinkValidations,
} from './index.mts'
import type { PrivateUser } from '@services/users/types'

describe('validations', () => {
  let adminUser: PrivateUser | null = null

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })
  it('create referral link validation with valid slug', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const slug = `test_validation_${randomSuffix}`

    const validation = await createReferralLinkValidation(adminUser, {
      slug,
      user_help_text: 'Test help text',
    })
    assert.ok(validation.id)
    assert.equal(validation.slug, slug)
    assert.equal(validation.user_help_text, 'Test help text')
  })

  it('create validation fails with invalid slug format', async () => {
    try {
      await createReferralLinkValidation(adminUser, {
        slug: 'Invalid-Slug!',
        user_help_text: 'Test',
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('create validation fails with uppercase slug', async () => {
    try {
      await createReferralLinkValidation(adminUser, {
        slug: 'UpperCase',
        user_help_text: 'Test',
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('get referral link validation by slug', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const slug = `test_validation_${randomSuffix}`

    const created = await createReferralLinkValidation(adminUser, {
      slug,
      user_help_text: 'Test help text',
    })
    const found = await getReferralLinkValidationBySlug(slug)

    assert.ok(found)
    assert.equal(found.id, created.id)
    assert.equal(found.slug, slug)
  })

  it('update referral link validation', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const slug = `test_validation_${randomSuffix}`

    const created = await createReferralLinkValidation(adminUser, {
      slug,
      user_help_text: 'Original text',
    })
    const updated = await updateReferralLinkValidation(adminUser, created.id, {
      user_help_text: 'Updated text',
    })

    assert.ok(updated)
    assert.equal(updated.user_help_text, 'Updated text')
    assert.equal(updated.slug, slug)
  })

  it('delete referral link validation', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const slug = `test_validation_${randomSuffix}`

    const created = await createReferralLinkValidation(adminUser, {
      slug,
      user_help_text: 'Test',
    })

    await deleteReferralLinkValidation(adminUser, created.id)

    const found = await getReferralLinkValidationBySlug(slug)
    assert.equal(found, null)
  })

  it('list referral link validations with pagination', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)

    const validation1 = await createReferralLinkValidation(adminUser, {
      slug: `zz_test_${randomSuffix}`,
      user_help_text: 'Test 1',
    })
    const validation2 = await createReferralLinkValidation(adminUser, {
      slug: `zz_test2_${randomSuffix}`,
      user_help_text: 'Test 2',
    })

    // Paginate through all pages to find both created validations regardless of
    // how many total rows exist or where the new slugs sort in the ordered list.
    const targetIds = new Set([validation1.id, validation2.id])
    let foundCount = 0
    let afterCursor: string | undefined
    do {
      const page = await listReferralLinkValidations({ limit: 100, after: afterCursor })
      for (const v of page.results) {
        if (targetIds.has(v.id)) foundCount++
      }
      afterCursor =
        page.page_info.has_next_page && page.page_info.end_cursor != null
          ? page.page_info.end_cursor
          : undefined
    } while (afterCursor !== undefined && foundCount < 2)

    assert.equal(foundCount, 2)
  })

  it('create validation requires admin role', async () => {
    const nonAdminUser = await createTestUser()
    try {
      await createReferralLinkValidation(nonAdminUser, {
        slug: 'test_slug',
        user_help_text: 'Test',
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 403)
    }
  })
})
