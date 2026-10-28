import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DismissibleAside } from './dismissible-aside'

describe('DismissibleAside', () => {
  it('renders content and an accessible dismiss button, then hides and saves dismissal', () => {
    render(
      <DismissibleAside dismissKey='test-aside-1'>
        <div>Aside content</div>
      </DismissibleAside>,
    )
    expect(screen.getByText('Aside content')).toBeVisible()
    const btn = screen.getByRole('button', { name: 'Dismiss test aside 1' })
    fireEvent.click(btn)
    expect(screen.queryByText('Aside content')).toBeNull()
    expect(localStorage.getItem('test-aside-1')).toBe('dismissed')
  })

  it('hides content when localStorage key is already dismissed', async () => {
    localStorage.setItem('test-aside-5', 'dismissed')
    await act(async () => {
      render(
        <DismissibleAside dismissKey='test-aside-5'>
          <div>Previously dismissed</div>
        </DismissibleAside>,
      )
    })
    expect(screen.queryByText('Previously dismissed')).toBeNull()
  })

  it('shows content when dismissKey is different from stored key', async () => {
    localStorage.setItem('other-key', 'dismissed')
    await act(async () => {
      render(
        <DismissibleAside dismissKey='test-aside-6'>
          <div>Different key content</div>
        </DismissibleAside>,
      )
    })
    expect(screen.getByText('Different key content')).toBeDefined()
  })
})
