import { describe, expect, it } from 'vitest'
import type { ToolApiEndpoint } from '@services/openai-agents/tool-types'
import { selectApiByArgument } from './select-api-by-argument.mts'

const ADD: ToolApiEndpoint = { method: 'POST', path: '/api/v1/things' }
const REMOVE: ToolApiEndpoint = { method: 'DELETE', path: '/api/v1/things/:id' }
const selectApi = selectApiByArgument('action', { add: ADD, remove: REMOVE })

describe('selectApiByArgument', () => {
  it('selects the route the argument names', () => {
    expect(selectApi({ action: 'add' })).toEqual([ADD])
    expect(selectApi({ action: 'remove' })).toEqual([REMOVE])
  })

  it.each([
    ['an unlisted value', { action: 'rename' }],
    ['an inherited property name', { action: 'constructor' }],
    ['a value that is not a string', { action: 3 }],
    ['an omitted argument', {}],
  ])('selects no route for %s', (_name, args) => {
    expect(selectApi(args)).toEqual([])
  })
})
