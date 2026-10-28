import {
  createFutureExpiresAt,
  createJsonResponse,
  installDataRequestDoubles,
  resetDataRequestDoubles,
} from '@/test-helpers/app/my/data-request-section.mock-support'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataRequestSection } from '../data-request-section'

describe('DataRequestSection account changes', () => {
  beforeEach(() => installDataRequestDoubles())
  afterEach(() => resetDataRequestDoubles())

  it('hides the previous account download while loading the next account', async () => {
    const nextLoad = Promise.withResolvers<Response>()
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          createJsonResponse(200, {
            id: 'old-export',
            status: 'ready',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: createFutureExpiresAt(),
            download_url: 'https://example.com/old-export.zip',
          }),
        )
        .mockReturnValueOnce(nextLoad.promise),
    )
    const { rerender } = render(<DataRequestSection userId='old-user' />)
    await screen.findByRole('link', { name: 'Download export' })

    rerender(<DataRequestSection userId='next-user' />)

    expect(screen.queryByRole('link', { name: 'Download export' })).toBeNull()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await act(async () => nextLoad.resolve(createJsonResponse(404, { error: 'No request' })))
    expect(screen.getByRole('button', { name: 'Request Data Export' })).toBeEnabled()
  })

  it.each(['success', 'failure'])(
    'ignores an old account initial load %s after the next account loads',
    async outcome => {
      const oldLoad = Promise.withResolvers<Response>()
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockReturnValueOnce(oldLoad.promise)
          .mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' })),
      )
      const { rerender } = render(<DataRequestSection userId='old-user' />)
      rerender(<DataRequestSection userId='next-user' />)
      await screen.findByRole('button', { name: 'Request Data Export' })

      await act(async () => {
        if (outcome === 'success') {
          oldLoad.resolve(
            createJsonResponse(200, {
              id: 'old-export',
              status: 'failed',
              created_at: '2026-01-01T00:00:00.000Z',
              expires_at: null,
              download_url: null,
            }),
          )
        } else {
          oldLoad.reject(new Error('Old account load failed'))
        }
        await oldLoad.promise.catch(() => undefined)
      })

      expect(screen.queryByText('Your data export failed. Please try again.')).toBeNull()
      expect(screen.queryByText('Failed to load export status. Please refresh.')).toBeNull()
      expect(screen.getByRole('button', { name: 'Request Data Export' })).toBeEnabled()
    },
  )
})
