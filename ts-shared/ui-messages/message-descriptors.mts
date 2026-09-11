import {
  isMessageDescriptor,
  plural as createPluralDescriptor,
  selectPlural as createSelectPluralDescriptor,
  type MessageDescriptor,
  type PluralForms,
  type PluralMessageDescriptor,
  type SelectPluralMessageDescriptor,
} from '@vouchington/utils/message-catalog'
import {
  COUNT_LABEL_NOUNS_EN,
  COUNT_LABEL_NOUNS_ES,
  COUNT_LABEL_NOUNS_FR,
  COUNT_LABEL_NOUNS_PT,
  type CountLabelNouns,
} from './count-label-nouns.mts'
import {
  TIME_AGO_NOUNS_EN,
  TIME_AGO_NOUNS_ES,
  TIME_AGO_NOUNS_FR,
  TIME_AGO_NOUNS_PT,
  type TimeAgoNouns,
} from './time-ago-nouns.mts'

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

function plural(
  valueParameter: string,
  forms: PluralForms,
  numberParameters: readonly string[] = [],
): PluralMessageDescriptor {
  return createPluralDescriptor(valueParameter, forms, numberParameters)
}

function selectPlural(
  valueParameter: string,
  selectParameter: string,
  cases: Readonly<Record<string, PluralForms>>,
  numberParameters: readonly string[] = [],
): SelectPluralMessageDescriptor {
  return createSelectPluralDescriptor(valueParameter, selectParameter, cases, numberParameters)
}

function countLabelCases(nouns: CountLabelNouns): Record<string, PluralForms> {
  return Object.fromEntries(
    Object.entries(nouns).map(([unit, [one, other]]) => [
      unit,
      { one: `{count} ${one}`, other: `{count} ${other}` },
    ]),
  )
}

function timeAgoCases(nouns: TimeAgoNouns, prefix: string, suffix: string) {
  return Object.fromEntries(
    Object.entries(nouns).map(([unit, [one, other]]) => [
      unit,
      {
        one: `${prefix}{value} ${one}${suffix}`,
        other: `${prefix}{value} ${other}${suffix}`,
      },
    ]),
  )
}

export const MESSAGE_DESCRIPTORS = {
  en: {
    supportedCount: plural('count', {
      one: '{count} language',
      other: '{count} languages',
    }),
    relativeDuration: selectPlural('value', 'unit', timeAgoCases(TIME_AGO_NOUNS_EN, '', ' ago')),
    countLabel: selectPlural('count', 'unit', countLabelCases(COUNT_LABEL_NOUNS_EN), ['count']),
  },
  es: {
    supportedCount: plural('count', { one: '{count} idioma', other: '{count} idiomas' }),
    relativeDuration: selectPlural('value', 'unit', timeAgoCases(TIME_AGO_NOUNS_ES, 'hace ', '')),
    countLabel: selectPlural('count', 'unit', countLabelCases(COUNT_LABEL_NOUNS_ES), ['count']),
  },
  fr: {
    supportedCount: plural('count', { one: '{count} langue', other: '{count} langues' }),
    relativeDuration: selectPlural('value', 'unit', timeAgoCases(TIME_AGO_NOUNS_FR, 'il y a ', '')),
    countLabel: selectPlural('count', 'unit', countLabelCases(COUNT_LABEL_NOUNS_FR), ['count']),
  },
  pt: {
    supportedCount: plural('count', { one: '{count} idioma', other: '{count} idiomas' }),
    relativeDuration: selectPlural('value', 'unit', timeAgoCases(TIME_AGO_NOUNS_PT, 'há ', '')),
    countLabel: selectPlural('count', 'unit', countLabelCases(COUNT_LABEL_NOUNS_PT), ['count']),
  },
} as const

export { isMessageDescriptor }
