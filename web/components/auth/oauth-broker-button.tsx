'use client'

import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import onError from '@/lib/on-error'
import { startOAuthBrokerAuthorization, type BrokerOAuthProvider } from '@/lib/auth/oauth-broker'
import type { OAuthBrokerPurpose } from '@/lib/api/client'
import { ProviderIcon } from './oauth-provider-icons'
import { providerButtonClassNames } from './oauth-provider-configs'

const providerLabels: Record<BrokerOAuthProvider, string> = {
  facebook: 'Facebook',
  x: 'X',
  github: 'GitHub',
}

let activeBrokerProvider: BrokerOAuthProvider | null = null
const brokerLeaseListeners = new Set<() => void>()

function subscribeToBrokerLease(listener: () => void): () => void {
  brokerLeaseListeners.add(listener)
  return () => brokerLeaseListeners.delete(listener)
}

function getActiveBrokerProvider(): BrokerOAuthProvider | null {
  return activeBrokerProvider
}

function acquireBrokerLease(provider: BrokerOAuthProvider): boolean {
  if (activeBrokerProvider !== null) return false
  activeBrokerProvider = provider
  for (const listener of brokerLeaseListeners) listener()
  return true
}

function releaseBrokerLease(provider: BrokerOAuthProvider): void {
  if (activeBrokerProvider !== provider) return
  activeBrokerProvider = null
  for (const listener of brokerLeaseListeners) listener()
}

export function OAuthBrokerButton({
  provider,
  purpose,
  returnTo,
  disabled,
}: {
  provider: BrokerOAuthProvider
  purpose: OAuthBrokerPurpose
  returnTo: string
  disabled?: boolean
}) {
  const activeProvider = useSyncExternalStore(
    subscribeToBrokerLease,
    getActiveBrokerProvider,
    getActiveBrokerProvider,
  )
  const loading = activeProvider === provider
  const label = providerLabels[provider]

  async function startBrokerAuthorization() {
    if (!acquireBrokerLease(provider)) return
    try {
      await startOAuthBrokerAuthorization({ provider, purpose, returnTo })
    } catch (error) {
      onError(error, {
        fallback: `Unable to connect ${label}. Please try again.`,
        tags: { form: 'oauth-broker', provider, purpose },
      })
    } finally {
      releaseBrokerLease(provider)
    }
  }

  return (
    <Button
      type='button'
      variant='outline'
      className={`w-full justify-center gap-3 ${providerButtonClassNames[provider]}`}
      onClick={startBrokerAuthorization}
      loading={loading}
      disabled={disabled || activeProvider !== null}
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic provider identifier
      data-pw={`oauth-provider-button-${provider}`}
    >
      {!loading && (
        <span className='shrink-0'>
          <ProviderIcon provider={provider} />
        </span>
      )}
      {loading ? 'Connecting...' : `Continue with ${label}`}
    </Button>
  )
}
