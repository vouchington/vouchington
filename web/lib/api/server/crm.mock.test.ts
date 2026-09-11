import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminCrmContacts,
  getAdminCrmContact,
  getAdminCrmContactEmails,
  getAdminCrmContactNotes,
} from './crm'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('crm server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ contacts: [] })
  })

  it('getAdminCrmContacts calls the crm contacts endpoint', async () => {
    await getAdminCrmContacts()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/crm/contacts', {})
  })

  it('getAdminCrmContact calls the contact detail endpoint', async () => {
    await getAdminCrmContact('contact-1')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/crm/contacts/contact-1', undefined)
  })

  it('getAdminCrmContactEmails calls the contact emails endpoint', async () => {
    await getAdminCrmContactEmails('contact-1')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/crm/contacts/contact-1/emails', {})
  })

  it('getAdminCrmContactNotes calls the contact notes endpoint', async () => {
    await getAdminCrmContactNotes('contact-1')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/crm/contacts/contact-1/notes', {})
  })
})
