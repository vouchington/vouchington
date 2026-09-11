'use client'

import type { MessageKey } from '@ts-shared/ui-messages'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { useAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ButtonProps } from '@/components/ui/button'

interface CommunityProxyBookmarkButtonProps {
  communityId: string
  kind: 'follow' | 'mute'
  initialActive?: boolean
  variant?: 'default' | 'secondary' | 'outline'
  size?: ButtonProps['size']
  'data-pw'?: string
}

const proxyBookmarkConfig = {
  follow: {
    predicate: 'proxy_follow',
    activeLabel: 'extracted.communities.communityProxyBookmarkButton.virtuallyFollowing_1b649994',
    inactiveLabel: 'extracted.communities.communityProxyBookmarkButton.virtuallyFollow_724e5f77',
    errorLabel: 'extracted.communities.communityProxyBookmarkButton.virtualFollow_5880822a',
    iconKey: 'proxyFollow',
  },
  mute: {
    predicate: 'proxy_mute',
    activeLabel: 'extracted.communities.communityProxyBookmarkButton.virtuallyMuting_e4a9fdad',
    inactiveLabel: 'extracted.communities.communityProxyBookmarkButton.virtuallyMute_430f0cea',
    errorLabel: 'extracted.communities.communityProxyBookmarkButton.virtualMute_9f690d30',
    iconKey: 'proxyMute',
  },
} satisfies Record<
  CommunityProxyBookmarkButtonProps['kind'],
  {
    predicate: 'proxy_follow' | 'proxy_mute'
    activeLabel: MessageKey
    inactiveLabel: MessageKey
    errorLabel: MessageKey
    iconKey: 'proxyFollow' | 'proxyMute'
  }
>

export function CommunityProxyBookmarkButton({
  communityId,
  kind,
  initialActive,
  variant = 'outline',
  size = 'touchSm',
  'data-pw': dataPw = 'community-proxy-bookmark-button',
}: CommunityProxyBookmarkButtonProps) {
  const config = proxyBookmarkConfig[kind]
  const { isAuthenticated } = useAuth()
  const t = useTranslations()
  const resolvedInitialActive = isAuthenticated ? initialActive : false

  return (
    <EntityBookmarkButton
      entityType='community'
      entityId={communityId}
      predicate={config.predicate}
      activeLabel={t(config.activeLabel)}
      inactiveLabel={t(config.inactiveLabel)}
      errorLabel={t(config.errorLabel)}
      iconKey={config.iconKey}
      initialActive={resolvedInitialActive}
      variant={variant}
      size={size}
      data-pw={dataPw}
    />
  )
}
