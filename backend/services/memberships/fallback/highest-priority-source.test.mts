import { randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import {
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  insertQueuedMembershipGrant,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { commitMembershipGrantTransaction } from '@voucha/test-helpers/membership-queued-grant-hold'
import { describe, expect, it, onTestFinished } from 'vitest'
import { membershipWorkConfig } from '../work-limits.mts'
import {
  getHighestPriorityFallbackSource,
  type ValidFallbackSource,
} from './highest-priority-source.mts'

function makeSource(
  index: number,
  overrides: Partial<ValidFallbackSource> = {},
): ValidFallbackSource {
  const id = `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`
  return {
    should_auto_renew: false,
    effective_at: new Date('2026-01-01T00:00:00.000Z'),
    expires_at: null,
    grant_created_at: null,
    has_open_grant_activation: false,
    membership_product_id: '00000000-0000-7000-8000-999999999999',
    membership_source_id: id,
    past_due_at: null,
    plan: 'plus',
    source_kind: 'family',
    ...overrides,
  }
}

function readNamedPlaceholder(
  input: string | { text?: string; values?: unknown[] },
  pattern: RegExp,
): unknown {
  if (typeof input === 'string') return undefined
  const match = input.text?.match(pattern)
  if (!match) throw new Error(`Expected SQL parameter matching ${pattern}`)
  return input.values?.[Number(match[1]) - 1]
}

describe('getHighestPriorityFallbackSource', () => {
  it('matches single-page selection when folding real DB fallback sources across keyset pages', async () => {
    const [admin, user] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    const [plusFamilySku, proFamilySku, plusGrantSku] = await Promise.all([
      createTestSku({
        plan: 'plus',
        provider_application_id: `fallback-plus-${randomUUID()}`,
      }),
      createTestSku({
        plan: 'pro',
        provider_application_id: `fallback-pro-${randomUUID()}`,
      }),
      createTestSku({ plan: 'plus', interval: 'yearly' }),
    ])
    const plusFamily = await createTestFamilyMembership({
      applicationId: plusFamilySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: plusFamilySku.id,
      membershipProviderProductId: plusFamilySku.membership_provider_product_id,
      userId: user.id,
    })
    await endTestMembershipProjection(plusFamily.id)
    await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: plusGrantSku.id,
      userId: user.id,
      durationDays: 30,
    })
    await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: plusGrantSku.id,
      userId: user.id,
      durationDays: 30,
    })
    await createTestFamilyMembership({
      applicationId: proFamilySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: proFamilySku.id,
      membershipProviderProductId: proFamilySku.membership_provider_product_id,
      userId: user.id,
    })

    const excludedSourceId = '00000000-0000-7000-8000-000000000000'
    const runWithBatchSize = async (batchSize: number) => {
      const restore = overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
        batch_size: batchSize,
      })
      onTestFinished(restore)
      try {
        const captured = await runWithCapturedQueries(() =>
          commitMembershipGrantTransaction(query =>
            getHighestPriorityFallbackSource(user.id, excludedSourceId, query),
          ),
        )
        return {
          selected: captured.result,
          pageReads: captured.queries.filter(query =>
            query.text.includes('restoreFallbackAfterCurrentAccessEnds: sources'),
          ).length,
        }
      } finally {
        restore()
      }
    }

    const multiPage = await runWithBatchSize(2)
    const singlePage = await runWithBatchSize(100)

    expect(multiPage.pageReads).toBe(3)
    expect(singlePage.pageReads).toBe(1)
    expect(multiPage.selected).toEqual(singlePage.selected)
    expect(multiPage.selected).toMatchObject({
      plan: 'pro',
      source_kind: 'family',
      membership_product_id: proFamilySku.id,
    })
  })

  it('preserves FIFO queued grants when an older grant arrives on a later keyset page', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(membershipWorkConfig, { batch_size: 2 }))
    const familyOnPage1 = makeSource(1, { source_kind: 'family' })
    const newerQueuedGrantOnPage1 = makeSource(2, {
      source_kind: 'admin_grant',
      has_open_grant_activation: false,
      grant_created_at: new Date('2026-03-01T00:00:00.000Z'),
      effective_at: new Date('2026-03-01T00:00:00.000Z'),
    })
    const olderQueuedGrantOnPage2 = makeSource(3, {
      source_kind: 'admin_grant',
      has_open_grant_activation: false,
      grant_created_at: new Date('2026-01-15T00:00:00.000Z'),
      effective_at: new Date('2026-01-15T00:00:00.000Z'),
    })
    const sortedSources = [familyOnPage1, newerQueuedGrantOnPage1, olderQueuedGrantOnPage2]
    let pageCalls = 0
    const query = (async (input: string | { text?: string; values?: unknown[] }) => {
      pageCalls += 1
      const afterSourceId = readNamedPlaceholder(input, /source\.id\s*>\s*\$(\d+)/) as string | null
      const limit = readNamedPlaceholder(input, /LIMIT\s+\$(\d+)/) as number
      const rows = sortedSources
        .filter(row => afterSourceId === null || row.membership_source_id > afterSourceId)
        .slice(0, limit)
      return { rows, rowCount: rows.length }
    }) as unknown as QueryExecutor

    const selected = await getHighestPriorityFallbackSource(
      '00000000-0000-7000-8000-000000000000',
      '00000000-0000-7000-8000-000000000000',
      query,
    )

    expect(pageCalls).toBe(2)
    expect(selected?.membership_source_id).toBe(olderQueuedGrantOnPage2.membership_source_id)
  })
})
