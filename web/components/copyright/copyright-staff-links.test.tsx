import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '@/lib/auth/context'
import { CopyrightStaffLinks } from './copyright-staff-links'

function renderAs(roles: string[] | null) {
  return render(
    <AuthContext
      value={{
        currentUser: roles ? { id: 'u1', roles, account_type: null } : null,
        isAuthenticated: roles !== null,
      }}
    >
      <CopyrightStaffLinks />
    </AuthContext>,
  )
}

describe('CopyrightStaffLinks', () => {
  it.each(['administrator', 'moderator'])('links a %s to both copyright staff queues', role => {
    renderAs([role])
    expect(screen.getByRole('link', { name: 'Copyright review queue' })).toHaveAttribute(
      'href',
      '/copyright/review-queue',
    )
    expect(screen.getByRole('link', { name: 'Copyright email review' })).toHaveAttribute(
      'href',
      '/copyright/email-review',
    )
  })

  it.each([
    ['a member', ['user']],
    ['a guest', null],
  ])('hides the staff queues from %s', (_viewer, roles) => {
    renderAs(roles)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('hides the staff queues outside an auth provider', () => {
    render(<CopyrightStaffLinks />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
