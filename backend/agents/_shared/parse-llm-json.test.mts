import { it, expect, describe } from 'vitest'
import { parseLLMJsonResponse } from './parse-llm-json.mts'

describe('parse-llm-json', () => {
  it('parses bare JSON object', () => {
    const result = parseLLMJsonResponse<{ key: string }>('{"key": "value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('parses bare JSON array', () => {
    const result = parseLLMJsonResponse<number[]>('[1, 2, 3]')
    expect(result).toEqual([1, 2, 3])
  })

  it('strips ```json fence', () => {
    const text = '```json\n{"title": "hello"}\n```'
    const result = parseLLMJsonResponse<{ title: string }>(text)
    expect(result).toEqual({ title: 'hello' })
  })

  it('strips ``` fence without language tag', () => {
    const text = '```\n{"title": "hello"}\n```'
    const result = parseLLMJsonResponse<{ title: string }>(text)
    expect(result).toEqual({ title: 'hello' })
  })

  it('handles extra whitespace around JSON', () => {
    const result = parseLLMJsonResponse<{ x: number }>('  \n  {"x": 1}  \n  ')
    expect(result).toEqual({ x: 1 })
  })

  it('handles JSON with nested objects', () => {
    const json = '{"a": {"b": [1, 2, {"c": true}]}}'
    const result = parseLLMJsonResponse(json)
    expect(result).toEqual({ a: { b: [1, 2, { c: true }] } })
  })

  it('throws SyntaxError with preview on invalid JSON', () => {
    expect(() => parseLLMJsonResponse('not json at all')).toThrow(SyntaxError)
    expect(() => parseLLMJsonResponse('not json at all')).toThrow(
      'Failed to parse LLM response as JSON',
    )
  })

  it('preserves the JSON.parse error as cause', () => {
    let caught: SyntaxError | null = null
    try {
      parseLLMJsonResponse('not json at all')
    } catch (error) {
      caught = error as SyntaxError
    }
    expect(caught).toBeInstanceOf(SyntaxError)
    expect(caught?.cause).toBeInstanceOf(SyntaxError)
  })

  it('truncates long invalid JSON in error message', () => {
    const longInvalid = 'x'.repeat(300)
    let caught: SyntaxError | null = null
    try {
      parseLLMJsonResponse(longInvalid)
    } catch (error) {
      caught = error as SyntaxError
    }
    expect(caught).toBeInstanceOf(SyntaxError)
    const syntaxError = caught!
    expect(syntaxError.message.length).toBeLessThan(300)
    expect(() => {
      throw new SyntaxError(syntaxError.message)
    }).toThrow(/…/)
  })

  it('handles ```JSON fence (case insensitive)', () => {
    const text = '```JSON\n{"flag": true}\n```'
    const result = parseLLMJsonResponse<{ flag: boolean }>(text)
    expect(result).toEqual({ flag: true })
  })
})
