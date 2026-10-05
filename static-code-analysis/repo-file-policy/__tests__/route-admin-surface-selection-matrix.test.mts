import { describe, expect, it } from 'vitest'

import { factoryReturnsPageThatCalls } from '../route-admin-surface-facts.mts'
import { collectRouteAdminSurfaceFacts } from '../route-admin-surface-query.mts'

// Frozen inputs and verdicts from the legacy TypeScript selection matrix.
const selectionCases = [
  {
    id: 'nested_factory_first',
    source:
      'function outer(){ function factory(){ function page(){ secure() } return {default:page} } }\nfunction factory(){ function page(){} return {default:page} }\n',
    expected: true,
  },
  {
    id: 'factory_overload_first',
    source:
      'function factory(): unknown;\nfunction factory(){ function page(){ secure() } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'generator_factory',
    source: 'function* factory(){ function page(){ secure() } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'arrow_factory_excluded',
    source:
      'const factory=()=>({}); function factory2(){}\nfunction factory(){ function page(){ secure() } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'last_direct_page',
    source:
      'function factory(){ function page(){ secure() } function page(){} return {default:page} }\n',
    expected: false,
  },
  {
    id: 'page_overload_last',
    source:
      'function factory(){ function page(){ secure() } function page(): unknown; return {default:page} }\n',
    expected: false,
  },
  {
    id: 'nested_page_excluded',
    source:
      'function factory(){ function page(){ secure() } function inner(){ function page(){} } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'arrow_page_excluded',
    source:
      'function factory(){ const page=()=>{}; function page(){ secure() } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'if_shadow_direct',
    source:
      'function factory(){ function page(){ secure() } if (flag) { function page(){} } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'if_only_nested',
    source:
      'function factory(){ if (flag) { function page(){ secure() } } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'switch_shadow_direct',
    source:
      'function factory(){ function page(){ secure() } switch (flag) { case 1: { function page(){} } } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'switch_only_nested',
    source:
      'function factory(){ switch (flag) { case 1: { function page(){ secure() } } } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'block_shadow_direct',
    source:
      'function factory(){ function page(){ secure() } { function page(){} } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'block_only_nested',
    source: 'function factory(){ { function page(){ secure() } } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'label_shadow_direct',
    source:
      'function factory(){ function page(){ secure() } label: { function page(){} } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'label_only_nested',
    source: 'function factory(){ label: { function page(){ secure() } } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'page_parameter_default_call',
    source: 'function factory(){ function page(ctx = secure()){} return {default:page} }\n',
    expected: false,
  },
  {
    id: 'factory_parameter_default_call',
    source: 'function factory(value = secure()){ function page(){} return {default:page} }\n',
    expected: false,
  },
  {
    id: 'factory_parameter_closure_return',
    source:
      'function factory(value = (() => { return {default:page} })()){ function page(){ secure() } }\n',
    expected: false,
  },
  {
    id: 'comments_direct',
    source:
      'export function factory(){ /* direct */ function page(){ /* guarded */ secure() } /* return */ return {default:page} }\n',
    expected: true,
  },
  {
    id: 'exported_generator_direct',
    source: 'export function* factory(){ function* page(){ secure() } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'named_closure_shadow_direct',
    source:
      'function factory(){ function page(){ secure() } function inner(){ function page(){} } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'named_closure_only_nested',
    source:
      'function factory(){ function inner(){ function page(){ secure() } } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'switch_case_only_nested',
    source:
      'function factory(){ switch (flag) { case 1: function page(){ secure() } } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'switch_case_shadow_direct',
    source:
      'function factory(){ function page(){ secure() } switch (flag) { case 1: function page(){} } return {default:page} }\n',
    expected: true,
  },
  {
    id: 'if_unbraced_only_nested',
    source: 'function factory(){ if (flag) function page(){ secure() } return {default:page} }\n',
    expected: false,
  },
  {
    id: 'labeled_function_only_nested',
    source: 'function factory(){ label: function page(){ secure() } return {default:page} }\n',
    expected: false,
  },
] as const

describe('route-admin-surface factory-selection AST-grep parity', () => {
  it.each(selectionCases)('$id preserves factory and page selection', ({ source, expected }) => {
    const facts = collectRouteAdminSurfaceFacts(source, 'synthetic-factory.tsx')
    expect(factoryReturnsPageThatCalls('factory', 'page', 'secure')(facts)).toBe(expected)
  })
})
