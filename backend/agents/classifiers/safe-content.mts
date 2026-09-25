import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'

declare const classifierSafeTextBrand: unique symbol
declare const classifierChoiceKeyBrand: unique symbol

export type ClassifierSafeText = string & { readonly [classifierSafeTextBrand]: true }
export type ClassifierChoiceKey = string & { readonly [classifierChoiceKeyBrand]: true }

const CHOICE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function classifierChoiceKey(value: string): ClassifierChoiceKey {
  if (!CHOICE_KEY_PATTERN.test(value)) {
    throw new Error('Classifier Choice keys must be opaque identifiers')
  }
  return value as ClassifierChoiceKey
}

export function isClassifierChoiceKey(value: string): value is ClassifierChoiceKey {
  return CHOICE_KEY_PATTERN.test(value)
}

export async function sanitizeClassifierExternalContent(
  content: string,
  options: {
    source: string
    contentType: string
    isTitle?: boolean
    includeReminder?: boolean
  },
): Promise<ClassifierSafeText> {
  const sanitized = await sanitizePromptInjection(content, { isTitle: options.isTitle })
  return wrapExternalContent(sanitized, {
    source: options.source,
    contentType: options.contentType,
    includeReminder: options.includeReminder,
  }) as ClassifierSafeText
}

/**
 * Multi-part twin of `sanitizeClassifierExternalContent`: sanitizes each part
 * independently (so a title part can pass `isTitle: true` while a body part
 * does not) and wraps the joined result exactly once. Keeps sanitizing and
 * `ClassifierSafeText` brand-creation coupled in this module rather than
 * exposing a wrap-only escape hatch that would let a caller brand
 * already-unsanitized text.
 */
export async function sanitizeClassifierExternalContentParts(
  parts: readonly { content: string; isTitle?: boolean }[],
  separator: string,
  options: {
    source: string
    contentType: string
    includeReminder?: boolean
  },
): Promise<ClassifierSafeText> {
  const sanitizedParts = await Promise.all(
    parts.map(part => sanitizePromptInjection(part.content, { isTitle: part.isTitle })),
  )
  return wrapExternalContent(sanitizedParts.join(separator), {
    source: options.source,
    contentType: options.contentType,
    includeReminder: options.includeReminder,
  }) as ClassifierSafeText
}

export function classifierPrompt(
  strings: TemplateStringsArray,
  ...externalValues: readonly ClassifierSafeText[]
): ClassifierSafeText {
  return strings.reduce(
    (result, part, index) => `${result}${part}${externalValues[index] ?? ''}`,
    '',
  ) as ClassifierSafeText
}
