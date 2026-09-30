'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { MfaReauthDialog } from '@/components/my/mfa-reauth-dialog'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { MfaStatus } from '@/types/user'

type MfaCredential = 'passkey' | 'totp'

interface MfaCredentialListPagination {
  clearError: () => void
  endCursor: string | null
  fetchError: Error | null
  hasNextPage: boolean
  loadMore: () => Promise<void | boolean>
  loadingMore: boolean
  resetKey: symbol
}

type MfaCredentialManagerAction =
  | { handleAdd: () => void; kind: 'list' }
  | { kind: 'setup'; panel: ReactNode }

interface MfaCredentialManagerShellProps {
  action: MfaCredentialManagerAction
  credential: MfaCredential
  list: ReactNode
  mfaStatus: MfaStatus
  onReauthClose: () => void
  onReauthVerified: (reAuthToken: string) => void
  pagination: MfaCredentialListPagination
  reauthOpen: boolean
}

export function MfaCredentialManagerShell({
  action,
  credential,
  list,
  mfaStatus,
  onReauthClose,
  onReauthVerified,
  pagination,
  reauthOpen,
}: MfaCredentialManagerShellProps) {
  const handleLoadMore = pagination.loadMore

  return (
    <div className='space-y-4'>
      <CredentialIntro credential={credential} />
      <InfiniteScroll
        hasNextPage={pagination.hasNextPage}
        endCursor={pagination.endCursor}
        onLoadMore={handleLoadMore}
        loadingMore={pagination.loadingMore}
        fetchError={pagination.fetchError}
        clearError={pagination.clearError}
        resetKey={pagination.resetKey}
      >
        {list}
      </InfiniteScroll>
      {action.kind === 'list' ? (
        <CredentialAddButton
          credential={credential}
          onAdd={action.handleAdd}
        />
      ) : (
        action.panel
      )}
      <MfaReauthDialog
        open={reauthOpen}
        mfaStatus={mfaStatus}
        onVerified={onReauthVerified}
        onClose={onReauthClose}
      />
    </div>
  )
}

function CredentialIntro({ credential }: { credential: MfaCredential }) {
  const t = useTranslations()
  if (credential === 'passkey') {
    return (
      <>
        <h2
          className='text-lg font-semibold'
          data-pw='passkeys-heading'
        >
          {t('extracted.my.passkeyManager.passkeys_c87ccdb4')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.my.passkeyManager.passkeysLetYouSignInSecurely_961cef6e')}
        </p>
      </>
    )
  }

  return (
    <>
      <h2
        className='text-lg font-semibold'
        data-pw='totp-manager-heading'
      >
        {t('extracted.my.totpManager.authenticatorApps_f06f5e1d')}
      </h2>
      <p className='text-sm text-muted-foreground'>
        {t('extracted.my.totpManager.useAnAuthenticatorAppToGenerate_99ff07ea')}
      </p>
    </>
  )
}

function CredentialAddButton({
  credential,
  onAdd,
}: {
  credential: MfaCredential
  onAdd: () => void
}) {
  const t = useTranslations()
  if (credential === 'passkey') {
    return (
      <Button
        variant='outline'
        onClick={onAdd}
        data-pw='add-passkey-button'
      >
        {t('extracted.my.passkeyManager.addPasskey_ffc92f64')}
      </Button>
    )
  }

  return (
    <Button
      variant='outline'
      onClick={onAdd}
      data-pw='totp-add-authenticator-button'
    >
      {t('extracted.my.totpManager.addAuthenticator_5e75b362')}
    </Button>
  )
}
