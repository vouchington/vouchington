import { describe, expect, it } from 'vitest'
import {
  selectHighestPriorityMembershipSource,
  type MembershipSourcePriority,
} from './select-highest-priority-source.mts'

describe('selectHighestPriorityMembershipSource', () => {
  it('selects same-kind sources by effective time then source ID', () => {
    const effectiveAt = new Date('2026-01-01T00:00:00.000Z')
    const sources: MembershipSourcePriority[] = [
      {
        effective_at: effectiveAt,
        membership_source_id: '00000000-0000-7000-8000-000000000001',
        plan: 'plus',
        source_kind: 'family',
      },
      {
        effective_at: new Date('2026-02-01T00:00:00.000Z'),
        membership_source_id: '00000000-0000-7000-8000-000000000002',
        plan: 'plus',
        source_kind: 'family',
      },
      {
        effective_at: effectiveAt,
        membership_source_id: '00000000-0000-7000-8000-000000000003',
        plan: 'plus',
        source_kind: 'family',
      },
    ]

    expect(selectHighestPriorityMembershipSource(sources)).toMatchObject({
      membership_source_id: '00000000-0000-7000-8000-000000000002',
    })
    expect(selectHighestPriorityMembershipSource([sources[2]!, sources[0]!])).toMatchObject({
      membership_source_id: '00000000-0000-7000-8000-000000000003',
    })
  })

  it('prefers equally entitled direct access, then grants, then family access', () => {
    const effectiveAt = new Date('2026-01-01T00:00:00.000Z')
    const sources: MembershipSourcePriority[] = [
      {
        effective_at: effectiveAt,
        membership_source_id: '00000000-0000-7000-8000-000000000001',
        plan: 'plus',
        source_kind: 'family',
      },
      {
        effective_at: new Date('2025-01-01T00:00:00.000Z'),
        membership_source_id: '00000000-0000-7000-8000-000000000002',
        plan: 'plus',
        source_kind: 'admin_grant',
      },
      {
        effective_at: new Date('2024-01-01T00:00:00.000Z'),
        membership_source_id: '00000000-0000-7000-8000-000000000003',
        plan: 'plus',
        source_kind: 'direct',
      },
    ]

    expect(selectHighestPriorityMembershipSource(sources)).toMatchObject({
      membership_source_id: '00000000-0000-7000-8000-000000000003',
    })
    expect(selectHighestPriorityMembershipSource(sources.slice(0, 2))).toMatchObject({
      membership_source_id: '00000000-0000-7000-8000-000000000002',
    })
  })
})
