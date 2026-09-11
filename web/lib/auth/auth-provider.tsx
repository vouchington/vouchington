'use client'

import { useMemo, type ReactNode } from 'react'
import type { ClientAuthUser } from './client-auth-user'
import { AuthContext } from './context'
import { admissionIdempotency } from '@/lib/api/client/admission-idempotency'

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser?: ClientAuthUser | null
}) {
  const currentUser = initialUser ?? null
  admissionIdempotency.setActor(currentUser?.id ?? null)
  const authValue = useMemo(
    () => ({ currentUser, isAuthenticated: currentUser !== null }),
    [currentUser],
  )
  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
}
