import { posix } from 'node:path'

const CANONICAL_CHILD_FRAGMENT_LINK_RE =
  /^- <a id="[^"]+"><\/a>\[[^\]\n]+\]\((?![a-z][a-z0-9+.-]*:|\/)([^)#?\s]+\.md)#[^)\s]+\)$/gim
const CANONICAL_CHILD_LINK_RE =
  /^- <a id="[^"]+"><\/a>\[[^\]\n]+\]\((?![a-z][a-z0-9+.-]*:|\/)([^)#?\s]+\.md)\)$/gim

export interface CanonicalMarkdownChildLink {
  index: number
  link: string
  target: string
}

function canonicalTargetKey(target: string): string {
  return posix.normalize(target)
}

export function canonicalWholeFileTargets(rootContent: string): Set<string> {
  return new Set(
    [...rootContent.matchAll(CANONICAL_CHILD_LINK_RE)].flatMap(match =>
      match[1] ? [canonicalTargetKey(match[1])] : [],
    ),
  )
}

export function canonicalWholeFileLinks(rootContent: string): CanonicalMarkdownChildLink[] {
  return [...rootContent.matchAll(CANONICAL_CHILD_LINK_RE)].flatMap(match => {
    const target = match[1]
    const index = match.index
    if (!target || index === undefined) return []
    return [{ index, link: match[0], target }]
  })
}

export function canonicalFragmentTargets(rootContent: string): Set<string> {
  const targets = new Set<string>()
  for (const match of rootContent.matchAll(CANONICAL_CHILD_FRAGMENT_LINK_RE)) {
    const target = match[1]
    if (target) targets.add(canonicalTargetKey(target))
  }
  return targets
}

export function fragmentOnlyCanonicalChildTargets(rootContent: string): string[] {
  const wholeFileTargets = canonicalWholeFileTargets(rootContent)
  return [...canonicalFragmentTargets(rootContent)].filter(target => !wholeFileTargets.has(target))
}
