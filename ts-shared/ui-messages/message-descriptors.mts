import {
  isMessageDescriptor,
  type MessageDescriptor,
  type PluralForms,
  type PluralMessageDescriptor,
  type SelectPluralMessageDescriptor,
} from '@vouchington/utils/message-catalog'

export type {
  MessageDescriptor,
  PluralForms,
  PluralMessageDescriptor,
  SelectPluralMessageDescriptor,
}

export const PLURAL_RULE_METADATA = {
  en: { algorithm: 'cardinal-one-versus-other' },
  es: { algorithm: 'cardinal-one-versus-other' },
  fr: { algorithm: 'cardinal-one-versus-other' },
  pt: { algorithm: 'cardinal-one-versus-other' },
} as const

export { isMessageDescriptor }
