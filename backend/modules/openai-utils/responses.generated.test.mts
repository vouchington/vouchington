import { describe, it, expect } from 'vitest'
import { extractTextFromOpenAIResponse } from './responses.mts'

describe('extractTextFromOpenAIResponse', () => {
  it('should extract text from array format with message object', () => {
    const response = {
      output: [
        {
          type: 'reasoning',
          status: 'completed',
          content: [{ type: 'text', text: 'reasoning text' }],
        },
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'output_text', text: 'extracted text content' }],
        },
      ],
    }
    expect(extractTextFromOpenAIResponse(response)).toBe('extracted text content')
  })

  it('should extract text from simple object format', () => {
    const response = {
      output: {
        text: 'simple text content',
      },
    }
    expect(extractTextFromOpenAIResponse(response)).toBe('simple text content')
  })

  it('should skip non-message items in array', () => {
    const response = {
      output: [
        {
          type: 'reasoning',
          status: 'completed',
          content: [{ type: 'text', text: 'reasoning' }],
        },
        {
          type: 'other',
          status: 'completed',
          content: [{ type: 'output_text', text: 'wrong text' }],
        },
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'output_text', text: 'correct text' }],
        },
      ],
    }
    expect(extractTextFromOpenAIResponse(response)).toBe('correct text')
  })

  it('should find output_text in content array', () => {
    const response = {
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [
            { type: 'text', text: 'wrong type' },
            { type: 'output_text', text: 'correct text' },
          ],
        },
      ],
    }
    expect(extractTextFromOpenAIResponse(response)).toBe('correct text')
  })

  it('should throw error for non-object response', () => {
    expect(() => extractTextFromOpenAIResponse(null)).toThrow('response is not an object')
    expect(() => extractTextFromOpenAIResponse('string')).toThrow('response is not an object')
    expect(() => extractTextFromOpenAIResponse(123)).toThrow('response is not an object')
  })

  it('should throw error for missing output', () => {
    expect(() => extractTextFromOpenAIResponse({})).toThrow('missing output')
    expect(() => extractTextFromOpenAIResponse({ output: null })).toThrow('missing output')
  })

  it('should throw error for empty array output', () => {
    expect(() => extractTextFromOpenAIResponse({ output: [] })).toThrow('Unexpected output format')
  })

  it('should throw error for array without message object', () => {
    const response = {
      output: [
        {
          type: 'reasoning',
          status: 'completed',
          content: [{ type: 'text', text: 'reasoning' }],
        },
      ],
    }
    expect(() => extractTextFromOpenAIResponse(response)).toThrow('Unexpected output format')
  })

  it('should throw error for message without content', () => {
    const response = {
      output: [
        {
          type: 'message',
          status: 'completed',
        },
      ],
    }
    expect(() => extractTextFromOpenAIResponse(response)).toThrow('Unexpected output format')
  })

  it('should throw error for message with empty content array', () => {
    const response = {
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [],
        },
      ],
    }
    expect(() => extractTextFromOpenAIResponse(response)).toThrow('Unexpected output format')
  })

  it('should throw error for content without output_text type', () => {
    const response = {
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'text', text: 'wrong type' }],
        },
      ],
    }
    expect(() => extractTextFromOpenAIResponse(response)).toThrow('Unexpected output format')
  })

  it('should throw error for output_text without text property', () => {
    const response = {
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'output_text' }],
        },
      ],
    }
    expect(() => extractTextFromOpenAIResponse(response)).toThrow('Unexpected output format')
  })

  it('should throw error for simple object without text property', () => {
    const response = {
      output: {
        notText: 'value',
      },
    }
    expect(() => extractTextFromOpenAIResponse(response)).toThrow('Unexpected output format')
  })

  it('should throw TypeError for simple object with non-string text', () => {
    const response = {
      output: {
        text: 123,
      },
    }
    expect(() => extractTextFromOpenAIResponse(response)).toThrow('Unexpected output format')
  })

  it('should handle message without completed status', () => {
    const response = {
      output: [
        {
          type: 'message',
          status: 'failed',
          content: [{ type: 'output_text', text: 'text' }],
        },
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'output_text', text: 'correct text' }],
        },
      ],
    }
    expect(extractTextFromOpenAIResponse(response)).toBe('correct text')
  })
})
