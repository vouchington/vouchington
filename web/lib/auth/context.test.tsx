import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './auth-provider'
import { useAuth } from './context'
import type { ClientAuthUser } from './client-auth-user'
import { admissionIdempotency } from '@/lib/api/client/admission-idempotency'

const mockSetAdmissionActor = vi
  .spyOn(admissionIdempotency, 'setActor')
  .mockImplementation(() => {})

const testUser: ClientAuthUser = {
  id: 'user-1',
  roles: ['user'],
  isOfficialAccount: false,
}

function AuthStateLabel() {
  const { currentUser, isAuthenticated } = useAuth()
  return <div>{isAuthenticated ? currentUser?.id : 'signed-out'}</div>
}

describe('AuthProvider', () => {
  it('provides authenticated and anonymous state', () => {
    const { rerender } = render(
      <AuthProvider initialUser={null}>
        <AuthStateLabel />
      </AuthProvider>,
    )
    expect(screen.getByText('signed-out')).toBeInTheDocument()
    expect(mockSetAdmissionActor).toHaveBeenLastCalledWith(null)

    rerender(
      <AuthProvider initialUser={testUser}>
        <AuthStateLabel />
      </AuthProvider>,
    )
    expect(screen.getByText('user-1')).toBeInTheDocument()
    expect(mockSetAdmissionActor).toHaveBeenLastCalledWith('user-1')
  })
})
