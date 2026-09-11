import { describe, expect, it } from 'vitest'
import { nativeStaffSupportApiFixtureCases } from './native-staff-support-cases.mts'

describe('native staff support fixture cases', () => {
  it('covers every read and mutation outcome used by native staff support', () => {
    expect(nativeStaffSupportApiFixtureCases.map(fixtureCase => fixtureCase.id)).toEqual([
      'native.staff-support.threads.default',
      'native.staff-support.thread-detail.default',
      'native.staff-support.thread-assign.default',
      'native.staff-support.thread-resolve.default',
      'native.staff-support.thread-reopen.default',
      'native.staff-support.messages.default',
      'native.staff-support.message-create.default',
      'native.staff-support.draft-create.default',
      'native.staff-support.message-edit.default',
      'native.staff-support.message-approve.default',
      'native.staff-support.message-send.default',
      'native.staff-support.contacts.default',
      'native.staff-support.contact-detail.default',
      'native.staff-support.contact-update.default',
    ])
  })

  it('registers every case for all native contract consumers', () => {
    for (const fixtureCase of nativeStaffSupportApiFixtureCases) {
      expect(fixtureCase.consumers).toEqual(['swift-core', 'swift-ui', 'dotnet-core'])
      expect(fixtureCase.auth).toBe('fixture-admin')
    }
  })
})
