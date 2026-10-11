import { vi } from 'vitest'

// Layout and content tests exercise the markdown boundary without loading Shiki.
vi.mock(import('@/components/shared/markdown-code-block-highlighter'), () => ({
  highlightCodeBlocks: vi
    .fn<typeof import('@/components/shared/markdown-code-block-highlighter').highlightCodeBlocks>()
    .mockResolvedValue(undefined),
}))
