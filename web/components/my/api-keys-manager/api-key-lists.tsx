'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { ApiKey } from '@/types/api-keys'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useNow } from '@/hooks/use-now'

interface ActiveApiKeysListProps {
  isAdministrator: boolean
  rotatingIds: Set<string>
  onRotate: (id: string) => void
  confirmingRevokeId: string | null
  keys: ApiKey[]
  revokingIds: Set<string>
  onCancelRevoke: () => void
  onConfirmRevoke: (id: string) => void
  onStartRevoke: (id: string) => void
}

export function ActiveApiKeysList({
  confirmingRevokeId,
  isAdministrator,
  rotatingIds,
  onRotate,
  keys,
  revokingIds,
  onCancelRevoke,
  onConfirmRevoke,
  onStartRevoke,
}: ActiveApiKeysListProps) {
  const t = useTranslations()
  const now = useNow()
  if (keys.length === 0) return null
  return (
    <ul className='space-y-3'>
      {keys.map(key => (
        <li
          key={key.id}
          className='rounded-md border p-4'
          data-pw='api-key-active-row'
        >
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div className='space-y-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-medium'>{key.label}</span>
                <Badge
                  variant='outline'
                  className='font-mono text-xs'
                >
                  {key.type}
                </Badge>
                <code className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground'>
                  {key.prefix}...
                </code>
              </div>
              <p className='text-sm'>
                {key.expires_at
                  ? t('settings.apiKeys.expiresAt', { date: formatUtcDate(key.expires_at) })
                  : t('settings.apiKeys.noExpiry')}
              </p>
              {key.expires_at && now !== null && new Date(key.expires_at).getTime() <= now && (
                <Badge>{t('settings.apiKeys.expired')}</Badge>
              )}
              {key.replaced_by_api_key_id && <Badge>{t('settings.apiKeys.replaced')}</Badge>}
              {isAdministrator &&
                (!key.expires_at ||
                  new Date(key.expires_at).getTime() - new Date(key.created_at).getTime() >
                    90 * 86_400_000) && (
                  <p className='text-sm text-destructive'>{t('settings.apiKeys.rotateOrRevoke')}</p>
                )}
              <div className='flex flex-wrap gap-1'>
                {key.permissions.map(p => (
                  <Badge
                    key={p}
                    variant='secondary'
                    className='text-xs'
                  >
                    {p}
                  </Badge>
                ))}
              </div>
              <p className='text-xs text-muted-foreground'>
                {t(
                  'extracted.apiKeysManager.apiKeyLists.createdCreatedatLastUsedLastused_a20b34bd',
                  {
                    createdAt: formatUtcDate(key.created_at),
                    lastUsed: key.last_used_at
                      ? formatUtcDate(key.last_used_at)
                      : t('extracted.apiKeysManager.apiKeyLists.never_6300ef80'),
                  },
                )}
              </p>
            </div>
            <div className='flex shrink-0 gap-2'>
              {!key.replaced_by_api_key_id &&
                (!key.expires_at || (now !== null && new Date(key.expires_at).getTime() > now)) && (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => onRotate(key.id)}
                    disabled={rotatingIds.has(key.id)}
                    data-pw='api-key-rotate'
                  >
                    {t('settings.apiKeys.rotate')}
                  </Button>
                )}
              {confirmingRevokeId === key.id ? (
                <>
                  <span className='self-center text-sm text-destructive'>
                    {t('extracted.apiKeysManager.apiKeyLists.revokeKey_d50d4f07')}
                  </span>
                  <Button
                    size='sm'
                    variant='destructive'
                    onClick={() => onConfirmRevoke(key.id)}
                    disabled={revokingIds.has(key.id)}
                    data-pw='api-key-revoke-confirm'
                  >
                    {t('extracted.apiKeysManager.apiKeyLists.confirm_eebdd24a')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={onCancelRevoke}
                  >
                    {t('extracted.apiKeysManager.apiKeyLists.cancel_19766ed6')}
                  </Button>
                </>
              ) : (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => onStartRevoke(key.id)}
                  disabled={revokingIds.has(key.id)}
                  data-pw='api-key-revoke-start'
                >
                  {t('extracted.apiKeysManager.apiKeyLists.revoke_87e6d00b')}
                </Button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function RevokedApiKeysList({ keys }: { keys: ApiKey[] }) {
  const t = useTranslations()
  if (keys.length === 0) return null
  return (
    <div className='space-y-2'>
      <h2 className='text-sm font-medium text-muted-foreground'>
        {t('extracted.apiKeysManager.apiKeyLists.revokedKeys_eee9ab4f')}
      </h2>
      <ul className='space-y-2'>
        {keys.map(key => (
          <li
            key={key.id}
            className='rounded-md border border-dashed bg-muted/30 p-4'
            data-pw='api-key-revoked-row'
          >
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-sm font-medium line-through'>{key.label}</span>
              <code className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground'>
                {key.prefix}...
              </code>
              <span className='text-xs text-muted-foreground'>
                {t('extracted.apiKeysManager.apiKeyLists.revokedRevokedat_fdb85526', {
                  revokedAt: key.revoked_at
                    ? formatUtcDate(key.revoked_at)
                    : t('extracted.apiKeysManager.apiKeyLists.unknown_b764cdc0'),
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
