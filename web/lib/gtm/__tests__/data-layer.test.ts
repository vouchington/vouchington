import { describe, it, expect, beforeEach } from 'vitest'
import { pushEvent } from '../data-layer'

describe('pushEvent', () => {
  beforeEach(() => {
    // Reset dataLayer before each test
    window.dataLayer = undefined as unknown as typeof window.dataLayer
  })

  it('initializes dataLayer if absent and pushes event', () => {
    pushEvent({ event: 'page_view', page_path: '/home' })

    expect(window.dataLayer).toHaveLength(1)
    expect(window.dataLayer?.[0]).toEqual({ event: 'page_view', page_path: '/home' })
  })

  it('pushes to existing dataLayer without resetting it', () => {
    window.dataLayer = [{ event: 'login' }]
    pushEvent({ event: 'sign_up' })

    expect(window.dataLayer).toHaveLength(2)
    expect(window.dataLayer?.[1]).toEqual({ event: 'sign_up' })
  })

  it('pushes typed sign_up event', () => {
    pushEvent({ event: 'sign_up', method: 'email' })

    expect(window.dataLayer?.[0]).toEqual({ event: 'sign_up', method: 'email' })
  })

  it('pushes typed login event', () => {
    pushEvent({ event: 'login', method: 'google' })

    expect(window.dataLayer?.[0]).toEqual({ event: 'login', method: 'google' })
  })
})
