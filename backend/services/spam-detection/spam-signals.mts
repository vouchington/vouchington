import { containsReferralLinks } from '@services/referral-program-link-validations'
import {
  MAX_EXTERNAL_LINKS,
  LINK_TO_TEXT_RATIO_THRESHOLD,
  SPAM_KEYWORD_PATTERNS,
} from './config.mts'
import type { SpamSignalResult } from './types.mts'

const COMPILED_SPAM_KEYWORD_PATTERNS = SPAM_KEYWORD_PATTERNS.map(p => new RegExp(p, 'i'))

/** Matches markdown links [text](url) and bare https?:// URLs */
const EXTERNAL_LINK_REGEX = /\[(?:[^\]]*)\]\((https?:\/\/[^)]+)\)|(?<![[(])(https?:\/\/\S+)/gi

/** Matches alpha characters */
const ALPHA_REGEX = /[a-z]/gi

/** Matches uppercase alpha characters */
const UPPER_ALPHA_REGEX = /[A-Z]/g

export function checkExcessiveLinks(markdown: string): SpamSignalResult {
  const linkMatches = [...markdown.matchAll(EXTERNAL_LINK_REGEX)]
  const linkCount = linkMatches.length

  // Count words (split on whitespace)
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length
  const ratio = wordCount > 0 ? linkCount / wordCount : 0

  const countFlagged = linkCount > MAX_EXTERNAL_LINKS
  const ratioFlagged = ratio > LINK_TO_TEXT_RATIO_THRESHOLD
  const flagged = countFlagged || ratioFlagged
  const score = Math.min(1, linkCount / 10)

  return {
    signal: 'excessive_links',
    score,
    flagged,
    details: { linkCount, wordCount, ratio: Math.round(ratio * 100) / 100 },
  }
}

export function checkSpamKeywords(title: string, markdown: string): SpamSignalResult {
  const text = `${title} ${markdown}`
  const matches: string[] = []

  for (let i = 0; i < COMPILED_SPAM_KEYWORD_PATTERNS.length; i++) {
    if (COMPILED_SPAM_KEYWORD_PATTERNS[i]!.test(text)) {
      matches.push(SPAM_KEYWORD_PATTERNS[i]!)
    }
  }

  const matchCount = matches.length
  const flagged = matchCount > 0
  // Score scales with number of matches, caps at 1.0
  const score = Math.min(1, matchCount / 3)

  return {
    signal: 'spam_keywords',
    score,
    flagged,
    details: { matchCount, matches },
  }
}

export function checkLowQualityText(markdown: string): SpamSignalResult {
  const signals: string[] = []

  // Detect excessive caps (>50% of alpha chars are uppercase)
  const alphaChars = markdown.match(ALPHA_REGEX) ?? []
  const upperChars = markdown.match(UPPER_ALPHA_REGEX) ?? []
  const capsRatio = alphaChars.length > 10 ? upperChars.length / alphaChars.length : 0
  if (capsRatio > 0.5) {
    signals.push('excessive_caps')
  }

  // Detect repetitive patterns: same word appearing 5+ times
  const words = markdown.toLowerCase().match(/\b\w{3,}\b/g) ?? []
  const wordFreq = new Map<string, number>()
  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
  }
  const maxFreq = Math.max(0, ...[...wordFreq.values()])
  if (maxFreq >= 5) {
    signals.push('repetitive_words')
  }

  // Detect very short content that also contains links
  const linkMatches = [...markdown.matchAll(EXTERNAL_LINK_REGEX)]
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length
  if (wordCount < 20 && linkMatches.length > 0) {
    signals.push('short_with_links')
  }

  const flagged = signals.length > 0
  const score = Math.min(1, signals.length / 3)

  return {
    signal: 'low_quality_text',
    score,
    flagged,
    details: { signals, capsRatio: Math.round(capsRatio * 100) / 100, wordCount },
  }
}

export async function checkReferralLinkInPost(markdown: string): Promise<SpamSignalResult> {
  const all_urls = [...markdown.matchAll(EXTERNAL_LINK_REGEX)].flatMap(m => {
    const url = m[1] ?? m[2]
    return url ? [url] : []
  })
  if (all_urls.length === 0) {
    return { signal: 'referral_link_in_post', score: 0, flagged: false }
  }

  const result = await containsReferralLinks(all_urls)

  return {
    signal: 'referral_link_in_post',
    score: result.has_referral_links ? 1.0 : 0.0,
    flagged: result.has_referral_links,
    details: result.has_referral_links
      ? {
          matched_urls: result.matched_urls.map(m => m.url),
          matched_count: result.matched_urls.length,
        }
      : undefined,
  }
}
