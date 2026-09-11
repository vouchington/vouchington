import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MermaidValidationOptions, MermaidValidationResult } from 'no-mistakes'

const noMistakes = vi.hoisted(() => ({
  validateMermaidMarkdown:
    vi.fn<(options: MermaidValidationOptions) => Promise<MermaidValidationResult>>(),
}))

vi.mock<typeof import('no-mistakes')>(
  import('no-mistakes'),
  () =>
    ({
      ...noMistakes,
      default: noMistakes as unknown as typeof import('no-mistakes'),
    }) as unknown as typeof import('no-mistakes'),
)

import { validatePlanMermaidMarkdown } from '../../plan-issue.mts'

function mermaidResult(overrides: Partial<MermaidValidationResult> = {}): MermaidValidationResult {
  return {
    valid: true,
    diagramCount: 0,
    diagnostics: [],
    ...overrides,
  }
}

describe('Plan issue Mermaid adapter', () => {
  beforeEach(() => {
    noMistakes.validateMermaidMarkdown.mockReset()
  })

  it('formats no-mistakes diagnostics as plan validation errors', async () => {
    noMistakes.validateMermaidMarkdown.mockResolvedValue(
      mermaidResult({
        valid: false,
        diagramCount: 1,
        diagnostics: [
          {
            code: 'invalid-syntax',
            file: 'Plan issue body',
            fenceLine: 1,
            message: 'unexpected end of input',
          },
        ],
      }),
    )

    await expect(validatePlanMermaidMarkdown('broken')).resolves.toEqual([
      'Plan issue body:1: unexpected end of input',
    ])
    expect(noMistakes.validateMermaidMarkdown).toHaveBeenCalledWith({
      content: 'broken',
      file: 'Plan issue body',
    })
  })

  it('returns no errors when no-mistakes reports a valid diagram', async () => {
    noMistakes.validateMermaidMarkdown.mockResolvedValue(
      mermaidResult({ valid: true, diagramCount: 1 }),
    )

    await expect(validatePlanMermaidMarkdown('ok')).resolves.toEqual([])
  })
})
