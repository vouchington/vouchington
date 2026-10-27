'use client'

import { useEffect, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePasskeyPagination } from '../passkey-manager/use-passkey-pagination'
import { getPasskeysClient, getPasskeyReAuthOptions, verifyPasskeyReAuth } from '@/lib/api/client'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ListResponse } from '@/types/api-responses'
import type { Passkey } from '@/types/user'
import { useReAuthVerification } from './use-reauth-verification'

type Props = {
  loading: boolean
  setLoading: (loading: boolean) => void
  onVerified: (token: string) => void
}

export function PasskeyReAuthPane(props: Props) {
  const t = useTranslations()
  const [page, setPage] = useState<ListResponse<Passkey>>()
  const [error, setError] = useState<Error>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    void getPasskeysClient().then(
      result => {
        if (current) setPage(result)
      },
      err => {
        if (current) setError(err instanceof Error ? err : new Error(String(err)))
      },
    )
    return () => {
      current = false
    }
  }, [attempt])
  if (page)
    return (
      <PasskeyChoices
        {...props}
        initialData={page}
      />
    )
  if (error)
    return (
      <Button
        onClick={() => {
          setError(undefined)
          setAttempt(previous => previous + 1)
        }}
      >
        {t('extracted.shared.paginatedListFooter.retry_942087cc')}
      </Button>
    )
  return <p aria-busy>{t('extracted.shared.paginatedListFooter.loading_ba3bbbe1')}</p>
}

function PasskeyChoices({ initialData, ...props }: Props & { initialData: ListResponse<Passkey> }) {
  const t = useTranslations()
  const { passkeys, pagination } = usePasskeyPagination(initialData)
  const verify = useReAuthVerification(props)
  async function verifySelectedPasskey(passkeyId: string) {
    const { flowId, response } = await getSelectedPasskeyAssertion(passkeyId)
    const proof = await verifyPasskeyReAuth(passkeyId, flowId, response)
    return proof.re_auth_token
  }

  async function getSelectedPasskeyAssertion(passkeyId: string) {
    const challenge = await getPasskeyReAuthOptions(passkeyId)
    const response = await startAuthentication({ optionsJSON: challenge.options })
    return { flowId: challenge.flow_id, response }
  }
  return (
    <InfiniteScroll
      hasNextPage={pagination.hasNextPage}
      endCursor={pagination.endCursor}
      onLoadMore={() => pagination.loadMore()}
      loadingMore={pagination.loadingMore}
      fetchError={pagination.fetchError}
      clearError={pagination.clearError}
      resetKey={pagination.resetKey}
    >
      <div
        className='flex flex-col gap-2'
        data-pw='reauth-passkey-choices'
      >
        {passkeys.map(passkey => (
          <Button
            key={passkey.id}
            variant='outline'
            disabled={props.loading}
            onClick={() => verify(() => verifySelectedPasskey(passkey.id))}
          >
            {passkey.name || t('extracted.my.passkeyManager.myPasskey_e8f5c02d')}
          </Button>
        ))}
      </div>
    </InfiniteScroll>
  )
}
