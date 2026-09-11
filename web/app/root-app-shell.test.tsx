import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import type { User } from '@/types/user'
import { RootAppShell } from './root-app-shell'

function findElementByType(node: ReactNode, type: ReactElement['type']): ReactElement | null {
  if (!isValidElement(node)) return null
  if (node.type === type) return node

  const children = (node.props as { children?: ReactNode }).children
  const childNodes = Array.isArray(children) ? children : [children]
  return childNodes.reduce<ReactElement | null>(
    (match, child) => match ?? findElementByType(child, type),
    null,
  )
}

describe('RootAppShell auth boundary', () => {
  it('passes only the exact client auth projection to AuthProvider', () => {
    const privateUser: User = {
      id: 'user-1',
      roles: ['user'],
      username: 'private-name',
      email_address: 'tests+root-shell-boundary-c83e@voucha.ai',
      is_agent: true,
      suspended_reason: 'private reason',
    }

    const tree = RootAppShell({
      currentUser: privateUser,
      globalFeatureFlags: {},
      isStandaloneLandingPage: true,
      mainContent: <main />,
      runtimePublicConfig: {},
      uiLocale: 'en',
    })
    const authProvider = findElementByType(tree, AuthProvider)

    expect(authProvider).not.toBeNull()
    expect((authProvider!.props as { initialUser: unknown }).initialUser).toStrictEqual({
      id: 'user-1',
      roles: ['user'],
      isOfficialAccount: true,
    })
  })
})
