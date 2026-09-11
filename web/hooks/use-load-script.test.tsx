import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLoadScript } from './use-load-script'

describe('useLoadScript', () => {
  beforeEach(() => {
    document.head.querySelectorAll('script').forEach(script => script.remove())
  })

  it('applies nonce integrity and crossOrigin attributes to loaded scripts', async () => {
    renderHook(() =>
      useLoadScript('https://cdn.example.com/sdk.js', {
        nonce: 'nonce-123',
        integrity: 'sha384-test',
        crossOrigin: 'anonymous',
      }),
    )

    await waitFor(() => {
      const script = document.head.querySelector('script')
      expect(script).not.toBeNull()
      expect(script?.nonce).toBe('nonce-123')
      expect(script?.integrity).toBe('sha384-test')
      expect(script?.crossOrigin).toBe('anonymous')
    })
  })
})
