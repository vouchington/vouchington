import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DismissibleAside } from './dismissible-aside'

describe('DismissibleAside', () => {
  it('renders children by default', () => {
    render(
      <DismissibleAside dismissKey='test-aside-1'>
        <div>Aside content</div>
      </DismissibleAside>,
    )
    expect(screen.getByText('Aside content')).toBeDefined()
  })

  it('renders a dismiss button', () => {
    render(
      <DismissibleAside dismissKey='test-aside-2'>
        <div>Content</div>
      </DismissibleAside>,
    )
    expect(screen.getByRole('button', { name: 'Dismiss test aside 2' })).toBeDefined()
  })

  it('hides content after clicking dismiss', () => {
    render(
      <DismissibleAside dismissKey='test-aside-3'>
        <div>Hidden after dismiss</div>
      </DismissibleAside>,
    )
    const btn = screen.getByRole('button', { name: 'Dismiss test aside 3' })
    fireEvent.click(btn)
    expect(screen.queryByText('Hidden after dismiss')).toBeNull()
  })

  it('saves dismissed state to localStorage on dismiss', () => {
    render(
      <DismissibleAside dismissKey='test-aside-4'>
        <div>Content</div>
      </DismissibleAside>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss test aside 4' }))
    expect(localStorage.getItem('test-aside-4')).toBe('dismissed')
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
