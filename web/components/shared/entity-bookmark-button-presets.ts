import type { MessageKey } from '@ts-shared/ui-messages'

export type EntityBookmarkPreset = 'mute' | 'block' | 'subscribe'

export interface EntityBookmarkPresetConfig {
  predicate: string
  activeLabel: MessageKey
  inactiveLabel: MessageKey
  errorLabel: MessageKey
  variant: 'default' | 'secondary' | 'outline'
  loadingTooltip?: MessageKey
}

export const BOOKMARK_PRESETS: Record<EntityBookmarkPreset, EntityBookmarkPresetConfig> = {
  mute: {
    predicate: 'mute',
    activeLabel: 'extracted.shared.entityBookmarkButtonPresets.muted_2346f214',
    inactiveLabel: 'extracted.shared.entityBookmarkButtonPresets.mute_8dd6857b',
    errorLabel: 'extracted.shared.entityBookmarkButtonPresets.mute_a7aa1b97',
    variant: 'outline',
  },
  block: {
    predicate: 'block',
    activeLabel: 'extracted.shared.entityBookmarkButtonPresets.blocked_18f2a094',
    inactiveLabel: 'extracted.shared.entityBookmarkButtonPresets.block_211d0bb8',
    errorLabel: 'extracted.shared.entityBookmarkButtonPresets.block_496aca80',
    variant: 'outline',
  },
  subscribe: {
    predicate: 'subscribe',
    activeLabel: 'extracted.shared.entityBookmarkButtonPresets.subscribed_25c4797c',
    inactiveLabel: 'extracted.shared.entityBookmarkButtonPresets.subscribe_cc0e38da',
    errorLabel: 'extracted.shared.entityBookmarkButtonPresets.subscription_a8fa7fd6',
    variant: 'outline',
    loadingTooltip:
      'extracted.shared.entityBookmarkButtonPresets.loadingSubscriptionStatus_9c548ca4',
  },
}
