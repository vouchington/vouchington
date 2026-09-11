import { DynamicConfig } from '@data-stores/valkey'

export const moderationAiConfig = new DynamicConfig({
  key: 'moderation-ai-config',
  fieldTypes: {
    community_judgement_enabled: 'boolean',
  },
  defaultFields: {
    community_judgement_enabled: false,
  },
})

export const moderationAiDispatchConfig = new DynamicConfig({
  key: 'moderation-ai-dispatch-config',
  fieldTypes: {
    auto_dispatch_enabled: 'boolean',
    auto_dispatch_remove: 'boolean',
    auto_dispatch_warn: 'boolean',
    auto_dispatch_no_action: 'boolean',
  },
  defaultFields: {
    auto_dispatch_enabled: false,
    auto_dispatch_remove: false,
    auto_dispatch_warn: false,
    auto_dispatch_no_action: false,
  },
})
