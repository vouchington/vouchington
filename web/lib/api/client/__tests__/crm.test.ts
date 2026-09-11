import { afterEach, describe, expect, it, vi } from 'vitest'
import { importCrmCsv, unsubscribeCrmContactToken } from '../crm'
import { ApiError } from '../../error'

describe('crm client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs CRM CSV imports as a JSON body to the consolidated imports endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ batch: { id: 'batch-1', total_rows: 1 } }),
    } as Response)

    const result = await importCrmCsv('name,email\nAlice,tests+crm-import@voucha.ai')

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/imports/crm-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ csv: 'name,email\nAlice,tests+crm-import@voucha.ai' }),
    })
    expect(result).toEqual({ batch: { id: 'batch-1', total_rows: 1 } })
  })

  it('returns the validation body on a 422 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          valid: false,
          validation: {
            valid: false,
            rows: [{ row_index: 0, valid: false, errors: ['missing email'] }],
          },
        }),
    } as Response)

    const result = await importCrmCsv('name,bad\nAlice,x')

    expect(result).toEqual({
      valid: false,
      validation: {
        valid: false,
        rows: [{ row_index: 0, valid: false, errors: ['missing email'] }],
      },
    })
  })

  it('throws ApiError on a non-2xx, non-422 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    )

    await expect(importCrmCsv('name,email\nAlice,x@y.ai')).rejects.toBeInstanceOf(ApiError)
  })

  it('POSTs the unsubscribe token to the public CRM unsubscribe endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    } as Response)

    const result = await unsubscribeCrmContactToken('signed-token')

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/crm/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: 'signed-token' }),
    })
    expect(result).toEqual({ ok: true })
  })
})
