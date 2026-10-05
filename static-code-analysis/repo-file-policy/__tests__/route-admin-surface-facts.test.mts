import { describe, expect, it } from 'vitest'

import {
  callsRequireAdmin,
  factoryReturnsPageThatCalls,
  rejectsNonReferralProgramTopics,
  rendersPageWithAside,
} from '../route-admin-surface-facts.mts'
import { collectRouteAdminSurfaceFacts } from '../route-admin-surface-query.mts'

const factorySelectionEdges = [
  {
    id: 'missing-first-argument',
    source: 'function factory(){ function page(){ secure() } return {default:page} }',
    expected: false,
  },
  {
    id: 'member-first-argument',
    source: 'function factory(){ function page(){ secure(ctx.id) } return {default:page} }',
    expected: false,
  },
  {
    id: 'computed-callee',
    source: "function factory(){ function page(){ ctx['secure'](id) } return {default:page} }",
    expected: false,
  },
  {
    id: 'tagged-callee',
    source: 'function factory(){ function page(){ secure`id` } return {default:page} }',
    expected: false,
  },
  {
    id: 'transparent-callee-and-first-argument',
    source:
      'function factory(){ function page(){ ((secure as Function))(((id satisfies string))) } return {default:page} }',
    expected: true,
  },
  {
    id: 'quoted-default-key',
    source: "function factory(){ function page(){ secure(id) } return {'default':page} }",
    expected: false,
  },
  {
    id: 'computed-default-key',
    source: 'function factory(){ function page(){ secure(id) } return {[defaultKey]:page} }',
    expected: false,
  },
  {
    id: 'shorthand-default',
    source: 'function factory(){ function page(){ secure(id) } return {default} }',
    expected: false,
  },
  {
    id: 'transparent-returned-object',
    source:
      'function factory(){ function page(){ secure(id) } return (({default:page} as Result)) }',
    expected: true,
  },
  {
    id: 'nested-helper-call-and-return',
    source:
      'function factory(){ function page(){ function helper(){ secure(id); return {default:page} } return null } return {default:page} }',
    expected: true,
  },
] as const

describe('route-admin-surface AST-grep facts', () => {
  it('combines the protected policy facts and ignores nested page decoys', () => {
    const source = [
      'function requireAdmin() {}',
      'function loadReferralProgram(id: string) {}',
      "function validate(topic: Topic) { if (topic.topic_type !== 'referral_program') notFound() }",
      'function createReferralProgramValidationPage() {',
      '  if (false) { function ReferralProgramValidationPage() { return <Other.PageWithAside /> } }',
      '  function ReferralProgramValidationPage() {',
      '    requireAdmin()',
      '    const id = "route-id"',
      '    loadReferralProgram(id)',
      '    return <Layout.PageWithAside />',
      '  }',
      '  return { default: ReferralProgramValidationPage }',
      '}',
    ].join('\n')
    const facts = collectRouteAdminSurfaceFacts(source, 'synthetic-route.tsx')

    expect(callsRequireAdmin(facts)).toBe(true)
    expect(rejectsNonReferralProgramTopics(facts)).toBe(true)
    expect(rendersPageWithAside(facts)).toBe(true)
    expect(
      factoryReturnsPageThatCalls(
        'createReferralProgramValidationPage',
        'ReferralProgramValidationPage',
        'loadReferralProgram',
        'id',
      )(facts),
    ).toBe(true)
  })

  it('accepts escaped configured identifiers and default keys', () => {
    const source = [
      'function createRoutePage() {',
      '  function RoutePage() {',
      '    loadRoute(\\u{69}d)',
      '    return null',
      '  }',
      '  return { def\\u{61}ult: RoutePage }',
      '}',
    ].join('\n')
    const facts = collectRouteAdminSurfaceFacts(source, 'escaped-route.tsx')

    expect(
      factoryReturnsPageThatCalls('createRoutePage', 'RoutePage', 'loadRoute', 'id')(facts),
    ).toBe(true)
  })

  it('runs the pinned ast-grep binary when PATH has no package bin directory', () => {
    const originalPath = process.env.PATH
    process.env.PATH = ''
    try {
      const facts = collectRouteAdminSurfaceFacts(
        'function route() { requireAdmin() }',
        'reduced-path-route.tsx',
      )
      expect(callsRequireAdmin(facts)).toBe(true)
    } finally {
      if (originalPath === undefined) delete process.env.PATH
      else process.env.PATH = originalPath
    }
  })

  it('rejects page declarations nested under a control-flow block', () => {
    const source = [
      'function createRoutePage() {',
      '  if (enabled) {',
      '    function RoutePage() { loadRoute(id); return null }',
      '  }',
      '  return { default: RoutePage }',
      '}',
    ].join('\n')
    const facts = collectRouteAdminSurfaceFacts(source, 'nested-route.tsx')

    expect(
      factoryReturnsPageThatCalls('createRoutePage', 'RoutePage', 'loadRoute', 'id')(facts),
    ).toBe(false)
  })

  it.each(factorySelectionEdges)(
    '$id preserves factory call and return selection',
    ({ source, expected }) => {
      const facts = collectRouteAdminSurfaceFacts(source, 'synthetic-route.tsx')
      expect(factoryReturnsPageThatCalls('factory', 'page', 'secure', 'id')(facts)).toBe(expected)
    },
  )
})
