'use client'

import { createContext, use } from 'react'
import type { ClientAuthUser } from './client-auth-user'

export interface AuthContextType {
  currentUser: ClientAuthUser | null
  isAuthenticated: boolean
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = use(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useOptionalAuth() {
  return use(AuthContext)
}
