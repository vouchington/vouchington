import {
  sanitizePromptInjection,
  sanitizeRssContent,
  wrapExternalContent,
} from '@jongleberry/vurst-prompt'

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

export type ClassifierExternalContentPart = {
  content: string
  isTitle?: boolean
  /** Route through the RSS-HTML-aware sanitizer instead of plain prompt-injection sanitizing. */
  isRssHtml?: boolean
}

/**
 * Multi-part twin of `sanitizeClassifierExternalContent`: sanitizes each part
 * independently (so a title part can pass `isTitle: true`, or an RSS body
 * part can route through the HTML-aware sanitizer, while other parts do
 * not) and wraps the joined result exactly once. Keeps sanitizing and
 * `ClassifierSafeText` brand-creation coupled in this module rather than
 * exposing a wrap-only escape hatch that would let a caller brand
 * already-unsanitized text.
 */
export async function sanitizeClassifierExternalContentParts(
  parts: readonly ClassifierExternalContentPart[],
  separator: string,
  options: {
    source: string
    contentType: string
    includeReminder?: boolean
  },
): Promise<ClassifierSafeText> {
  const sanitizedParts = await Promise.all(
    parts.map(part =>
      part.isRssHtml
        ? sanitizeRssContent(part.content)
        : sanitizePromptInjection(part.content, { isTitle: part.isTitle }),
    ),
  )
  return wrapExternalContent(sanitizedParts.join(separator), {
    source: options.source,
    contentType: options.contentType,
    includeReminder: options.includeReminder,
  }) as ClassifierSafeText
}

const CANDIDATE_PLACEHOLDER = '{{candidate}}'

/**
 * Renders a classifier's DB-owned question template for one candidate: sanitizes the candidate's
 * display name as a title (it is short, attacker-influenceable, user-facing text -- the same
 * treatment a post/RSS title gets) and substitutes it into the template's placeholder. The
 * template itself is trusted, operator-authored instruction text (a `classifier_prompt_versions`
 * row), not external content, so unlike `sanitizeClassifierExternalContent*` this never calls
 * `wrapExternalContent` -- there is nothing here to mark as an external-source content block.
 *
 * Kept in this module (rather than letting a caller cast a substituted string to
 * `ClassifierSafeText` itself) so sanitizing the untrusted half of the output and branding the
 * result stay coupled, matching every other export here.
 */
export async function renderClassifierCandidateQuestion(
  template: string,
  candidateName: string,
): Promise<ClassifierSafeText> {
  const occurrences = template.split(CANDIDATE_PLACEHOLDER).length - 1
  if (occurrences !== 1) {
    throw new Error(
      `Classifier question template must contain exactly one ${CANDIDATE_PLACEHOLDER} placeholder`,
    )
  }
  const sanitizedName = await sanitizePromptInjection(candidateName, { isTitle: true })
  // A function replacer, not a string one: `String.prototype.replace` treats `$&`, `` $` ``, `$'`
  // and `$$` in a *string* replacement as special patterns (whole match, pre-match, post-match,
  // literal `$`) rather than literal text. `sanitizedName` is attacker-influenceable (it is the
  // candidate/topic's display name), so a string replacer would let one of those sequences splice
  // trusted template text into the rendered question. A function replacer's return value is always
  // inserted literally, with no special-pattern interpretation.
  return template.replace(CANDIDATE_PLACEHOLDER, () => sanitizedName) as ClassifierSafeText
}

/**
 * Brands a classifier's DB-owned Choice question template as `ClassifierSafeText`. Unlike
 * `renderClassifierCandidateQuestion` (rendered once per candidate via a `{{candidate}}`
 * placeholder), a Choice question is asked once per decision: the criteria stand in for the
 * per-candidate substitution, and the state -- not the question -- carries the actual candidate
 * content (see backend/agents/story-clustering/choice-clustering.mts). The template itself is
 * trusted, operator-authored instruction text (a `classifier_prompt_versions` row), not external
 * content, so this never calls `wrapExternalContent`. Asserts the template contains no
 * `{{candidate}}` placeholder, since a Choice question has nothing to substitute into one.
 */
export function renderClassifierChoiceQuestion(template: string): ClassifierSafeText {
  if (template.includes(CANDIDATE_PLACEHOLDER)) {
    throw new Error(
      `Classifier Choice question template must not contain a ${CANDIDATE_PLACEHOLDER} placeholder`,
    )
  }
  return template as ClassifierSafeText
}

/**
 * Joins already-branded `ClassifierSafeText` pieces (e.g. one sanitized-and-wrapped block per
 * candidate from `sanitizeClassifierExternalContentParts`) into a single `ClassifierSafeText`.
 * For a runtime-length list of pieces, where `classifierPrompt`'s fixed tagged-template shape does
 * not apply. Every piece is already sanitized, so this performs no sanitizing of its own -- only
 * string concatenation -- and stays in this module purely so call sites never need a bare
 * `as ClassifierSafeText` cast.
 */
export function joinClassifierSafeText(
  parts: readonly ClassifierSafeText[],
  separator: string,
): ClassifierSafeText {
  return parts.join(separator) as ClassifierSafeText
}

/**
 * Brands trusted, non-attacker-influenceable structural text -- a DB-generated ID, a criterion
 * key, an ISO timestamp -- as `ClassifierSafeText` without sanitizing or wrapping it, for
 * composing a decision's `state` alongside sanitized content blocks via `joinClassifierSafeText`
 * (e.g. a "Key: story:<uuid>" label placed next to that candidate's own sanitized title and
 * description, so the model can correlate a Choice criterion key back to the content describing
 * it). Never pass content that originated from an external feed, post, or any other
 * attacker-influenceable source through this -- use `sanitizeClassifierExternalContent*` for that.
 */
export function classifierStructuralText(value: string): ClassifierSafeText {
  return value as ClassifierSafeText
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
