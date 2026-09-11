'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { OAuthLoginButton } from '@/components/auth/oauth-login-button'
import { ProviderIcon } from '@/components/auth/oauth-provider-icons'
import { connectOAuthAccount, disconnectOAuthAccount } from '@/lib/api/client'
import { tokenToBody } from '@/lib/auth/oauth-token-body'
import { ApiError } from '@/lib/api/error'
import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'
import type { OAuthAccountInfo, OAuthProvider } from '@/types/user'

const providerLabels: Record<OAuthProvider, string> = {
  facebook: 'Facebook',
  apple: 'Apple',
  google: 'Google',
  x: 'X',
  linkedin: 'LinkedIn',
  microsoft: 'Microsoft',
  github: 'GitHub',
}

interface Props {
  provider: OAuthProvider
  initialAccount: OAuthAccountInfo | null
  providerConfigured?: boolean
  brokerEnabled?: boolean
  separator?: boolean
}

export function OAuthConnection({
  provider,
  initialAccount,
  providerConfigured = true,
  brokerEnabled = false,
  separator,
}: Props) {
  const [account, setAccount] = useState(initialAccount)
  const [loading, setLoading] = useState(false)
  const [providerAvailable, setProviderAvailable] = useState<boolean | null>(null)
  const label = providerLabels[provider]

  async function handleConnect(token: OAuthLoginToken) {
    try {
      const body = tokenToBody(token)
      const response = await connectOAuthAccount<{ oauth_account: OAuthAccountInfo }>(
        provider,
        body,
      )
      setAccount(response.oauth_account)
      toast.success(`${label} account connected`)
    } catch (error) {
      /* c8 ignore next 3 -- error path requires injecting an OAuth connect failure */
      const message =
        error instanceof ApiError ? error.message : `Failed to connect ${label} account`
      toast.error(message)
    }
  }

  async function handleDisconnect() {
    setLoading(true)
    try {
      await disconnectOAuthAccount(provider)
      setAccount(null)
      toast.success(`${label} account disconnected`)
    } catch (error) {
      /* c8 ignore next 3 -- error path requires injecting an OAuth disconnect failure */
      const message =
        error instanceof ApiError ? error.message : `Failed to disconnect ${label} account`
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      hidden={!account && (!providerConfigured || providerAvailable === false)}
      className='space-y-4'
    >
      {separator && <Separator />}
      <h2
        className='flex items-center gap-2 text-lg font-semibold'
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`oauth-connection-${provider}-heading`}
      >
        <ProviderIcon provider={provider} />
        {label}
      </h2>

      {account ? (
        <div className='flex items-center gap-3 rounded-md border p-4'>
          <div className='flex-1'>
            {account.name && <p className='text-sm font-medium'>{account.name}</p>}
            {account.email_address && (
              <p className='text-sm text-muted-foreground'>{account.email_address}</p>
            )}
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={handleDisconnect}
            loading={loading}
            disabled={loading}
          >
            {loading ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </div>
      ) : providerConfigured ? (
        <OAuthLoginButton
          provider={provider}
          onToken={handleConnect}
          onAvailabilityChange={setProviderAvailable}
          broker={
            brokerEnabled ? { purpose: 'connect', returnTo: '/my/identity#social' } : undefined
          }
        />
      ) : null}
    </div>
  )
}
