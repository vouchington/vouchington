import type { NamedRange, RouteAdminSurfaceFacts } from './route-admin-surface-query.mts'

const identifierMatchers = new Map<string, RegExp>()

export function callsRequireAdmin(facts: RouteAdminSurfaceFacts): boolean {
  return facts.calls.some(fact => matchesIdentifier(fact.name, 'requireAdmin'))
}

export function rendersPageWithAside(facts: RouteAdminSurfaceFacts): boolean {
  return facts.jsxTags.some(fact => matchesIdentifier(fact.name, 'PageWithAside'))
}

export function rejectsNonReferralProgramTopics(facts: RouteAdminSurfaceFacts): boolean {
  return facts.topicComparisons.length > 0
}

export function factoryReturnsPageThatCalls(
  factoryName: string,
  pageName: string,
  callName: string,
  firstArgumentName?: string,
): (facts: RouteAdminSurfaceFacts) => boolean {
  return facts => {
    const factory = facts.declarations
      .filter(fact => matchesIdentifier(fact.name, factoryName))
      .toSorted((left, right) => left.range.start - right.range.start)[0]
    if (!factory) return false
    const factoryBody = bodyFor(facts.bodies, factory)
    if (!factoryBody) return false

    const page = facts.declarations
      .filter(
        fact =>
          matchesIdentifier(fact.name, pageName) &&
          contains(factoryBody.body, fact.range) &&
          sameRange(nearestContainer(facts.containers, fact.range), factoryBody.body),
      )
      .toSorted((left, right) => right.range.start - left.range.start)[0]
    if (!page) return false
    const pageBody = bodyFor(facts.bodies, page)
    if (!pageBody) return false

    const hasCall = facts.calls.some(
      fact =>
        matchesIdentifier(fact.name, callName) &&
        contains(pageBody.body, fact.range) &&
        (!firstArgumentName ||
          facts.firstArguments.some(
            first =>
              sameRange(first.range, fact.range) &&
              matchesIdentifier(first.name, firstArgumentName),
          )),
    )
    const returnsDefault = facts.returnedDefaults.some(
      fact => matchesIdentifier(fact.name, pageName) && contains(factoryBody.body, fact.range),
    )
    return hasCall && returnsDefault
  }
}

function bodyFor(bodies: RouteAdminSurfaceFacts['bodies'], declaration: NamedRange) {
  return bodies.find(body => sameRange(body.range, declaration.range))
}

function nearestContainer(
  containers: RouteAdminSurfaceFacts['containers'],
  range: NamedRange['range'],
) {
  return containers
    .filter(container => contains(container, range))
    .toSorted((left, right) => left.end - left.start - (right.end - right.start))[0]
}

function sameRange(left: NamedRange['range'] | undefined, right: NamedRange['range']): boolean {
  return left?.start === right.start && left.end === right.end
}

function contains(outer: NamedRange['range'], inner: NamedRange['range']): boolean {
  return outer.start <= inner.start && inner.end <= outer.end
}

function matchesIdentifier(raw: string, expected: string): boolean {
  let matcher = identifierMatchers.get(expected)
  if (!matcher) {
    matcher = new RegExp(identifierRegex(expected))
    identifierMatchers.set(expected, matcher)
  }
  return matcher.test(raw)
}

function identifierRegex(value: string): string {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)) {
    throw new Error('route-admin policy identifiers must be ASCII identifiers')
  }
  return `^${value.split('').map(identifierCharacterRegex).join('')}$`
}

function identifierCharacterRegex(character: string): string {
  const escapeRaw = character.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const hexadecimal = character.codePointAt(0)?.toString(16) ?? ''
  const fixed = hexadecimal.padStart(4, '0')
  const hexCase = (digit: string) =>
    /[a-f]/iu.test(digit) ? `[${digit.toLowerCase()}${digit.toUpperCase()}]` : digit
  const fixedHex = fixed.split('').map(hexCase).join('')
  const bracedHex = hexadecimal.split('').map(hexCase).join('')
  return `(?:${escapeRaw}|\\\\u${fixedHex}|\\\\u\\{0*${bracedHex}\\})`
}
