import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { PendingModerationReport } from '../get.mts'
import { applyDeletedTargetLabel } from '../redaction.mts'

describe('applyDeletedTargetLabel', () => {
  it('returns the report unchanged when target_available is not false', () => {
    const report = {
      id: crypto.randomUUID(),
      target_available: true,
      target_label: 'Some Post',
      target_path: '/discussion/some-post',
      admin_action_path: '/admin/some-post',
    } as unknown as PendingModerationReport

    const result = applyDeletedTargetLabel(report)
    expect(result).toBe(report)
    expect(result.target_label).toBe('Some Post')
    expect(result.target_path).toBe('/discussion/some-post')
    expect(result.admin_action_path).toBe('/admin/some-post')
  })

  it('returns the report unchanged when target_available is null', () => {
    const report = {
      id: crypto.randomUUID(),
      target_available: null,
      target_label: 'User',
      target_path: '/u/testuser',
      admin_action_path: '/admin/users/testuser',
    } as unknown as PendingModerationReport

    const result = applyDeletedTargetLabel(report)
    expect(result).toBe(report)
  })

  it('applies [deleted content] label when target_available is false', () => {
    const report = {
      id: crypto.randomUUID(),
      target_available: false,
      target_label: 'Deleted Post',
      target_content: {
        kind: 'post',
        text: 'Deleted Post',
        declared_language: 'ar',
        lingua_rs_detected_language: 'en',
      },
      target_path: '/discussion/deleted-post',
      admin_action_path: '/admin/deleted-post',
    } as unknown as PendingModerationReport

    const result = applyDeletedTargetLabel(report)
    expect(result).not.toBe(report)
    expect(result.target_label).toBe('[deleted content]')
    expect(result.target_content).toBeNull()
    expect(result.target_path).toBeNull()
    expect(result.admin_action_path).toBeNull()
  })
})
