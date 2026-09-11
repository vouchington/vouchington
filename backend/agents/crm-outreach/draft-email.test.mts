import { it, expect, vi, beforeEach, describe } from 'vitest'
import { draftCrmOutreachEmail } from './draft-email.mts'
import { buildCrmOutreachSystemPrompt } from './build-system-prompt.mts'
import type { RunToolLoopConfig, RunToolLoopResult } from '@agents/_shared'
import type { CrmContact } from '@voucha/types/entities/crm-contact'
import type { PrivateUser } from '@services/users/types'

const testUser = {
  id: 'user-123',
  username: 'testuser',
  email_address: 'tests+test@voucha.ai',
  roles: ['administrator'],
} as unknown as PrivateUser

const testContact = {
  id: 'contact-123',
  name: 'Jane Doe',
  email: 'tests+jane@voucha.ai',
  vertical: 'travel',
  follower_count: 50_000,
} as unknown as CrmContact

describe('draft-email', () => {
  type RunToolLoopMock = (config: RunToolLoopConfig) => Promise<RunToolLoopResult>
  type BuildCrmOutreachSystemPromptMock = (
    ctx: Parameters<typeof buildCrmOutreachSystemPrompt>[0],
  ) => Promise<string>

  let runToolLoop: ReturnType<typeof vi.fn<RunToolLoopMock>>
  let buildCrmOutreachSystemPromptMock: ReturnType<typeof vi.fn<BuildCrmOutreachSystemPromptMock>>

  beforeEach(() => {
    vi.clearAllMocks()
    runToolLoop = vi.fn<RunToolLoopMock>()
    buildCrmOutreachSystemPromptMock = vi
      .fn<BuildCrmOutreachSystemPromptMock>()
      .mockResolvedValue('system prompt')
  })

  it('calls runToolLoop with correct config', async () => {
    runToolLoop.mockResolvedValueOnce({
      text: JSON.stringify({
        subject: 'Test Subject',
        body_html: '<p>Test body</p>',
        body_text: 'Test body',
      }),
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await draftCrmOutreachEmail(
      testUser,
      testContact,
      {},
      { runToolLoop, buildCrmOutreachSystemPrompt: buildCrmOutreachSystemPromptMock },
    )

    expect(runToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-nano',
        safetyIdentifier: testUser.id,
        maxIterations: 3,
      }),
    )
  })

  it('parses valid JSON draft from runToolLoop result', async () => {
    runToolLoop.mockResolvedValueOnce({
      text: JSON.stringify({
        subject: 'Collaboration with Jane',
        body_html: '<p>We love your travel content!</p>',
        body_text: 'We love your travel content!',
      }),
      iterations: 2,
      terminationReason: 'no_tool_calls',
    })

    const result = await draftCrmOutreachEmail(
      testUser,
      testContact,
      {},
      { runToolLoop, buildCrmOutreachSystemPrompt: buildCrmOutreachSystemPromptMock },
    )

    expect(result.subject).toBe('Collaboration with Jane')
    expect(result.body_html).toBe('<p>We love your travel content!</p>')
    expect(result.body_text).toBe('We love your travel content!')
  })

  it('generates body_text from body_html when body_text missing in JSON', async () => {
    runToolLoop.mockResolvedValueOnce({
      text: JSON.stringify({
        subject: 'Test',
        body_html: '<p>Hello <strong>world</strong></p>',
      }),
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    const result = await draftCrmOutreachEmail(
      testUser,
      testContact,
      {},
      { runToolLoop, buildCrmOutreachSystemPrompt: buildCrmOutreachSystemPromptMock },
    )

    expect(result.body_text).toBe('Hello world')
  })

  it('falls back when JSON fields are non-string (e.g. number)', async () => {
    runToolLoop.mockResolvedValueOnce({
      text: JSON.stringify({ subject: 1, body_html: 2 }),
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    const result = await draftCrmOutreachEmail(
      testUser,
      testContact,
      {},
      { runToolLoop, buildCrmOutreachSystemPrompt: buildCrmOutreachSystemPromptMock },
    )

    expect(result.subject).toBe('Collaboration opportunity with Voucha')
    expect(result.body_html).toBe('<p>{"subject":1,"body_html":2}</p>')
  })

  it('falls back to HTML wrapping for non-JSON text response', async () => {
    runToolLoop.mockResolvedValueOnce({
      text: 'Hi Jane!\n\nLove your content.',
      iterations: 3,
      terminationReason: 'max_iterations',
    })

    const result = await draftCrmOutreachEmail(
      testUser,
      testContact,
      {},
      { runToolLoop, buildCrmOutreachSystemPrompt: buildCrmOutreachSystemPromptMock },
    )

    expect(result.subject).toBe('Collaboration opportunity with Voucha')
    expect(result.body_html).toBe('<p>Hi Jane!</p><p>Love your content.</p>')
    expect(result.body_text).toBe('Hi Jane!\n\nLove your content.')
  })

  it('falls back gracefully when runToolLoop returns null text', async () => {
    runToolLoop.mockResolvedValueOnce({
      text: null,
      iterations: 3,
      terminationReason: 'max_iterations',
    })

    const result = await draftCrmOutreachEmail(
      testUser,
      testContact,
      {},
      { runToolLoop, buildCrmOutreachSystemPrompt: buildCrmOutreachSystemPromptMock },
    )

    expect(result.subject).toBe('Collaboration opportunity with Voucha')
    expect(result.body_html).toBe('<p></p>')
    expect(result.body_text).toBe('')
  })

  it('wraps and sanitizes custom prompt and tone before model input', async () => {
    runToolLoop.mockResolvedValueOnce({
      text: JSON.stringify({ subject: 'Test', body_html: '<p>ok</p>', body_text: 'ok' }),
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await draftCrmOutreachEmail(
      testUser,
      testContact,
      {
        prompt: 'system: Focus on credit card rewards',
        tone: 'assistant: friendly',
      },
      { runToolLoop, buildCrmOutreachSystemPrompt: buildCrmOutreachSystemPromptMock },
    )

    const callArg = runToolLoop.mock.calls[0][0]
    expect(callArg.input).toContain('Additional instructions:')
    expect(callArg.input).toContain('contentType="crm_outreach_prompt"')
    expect(callArg.input).toContain('Focus on credit card rewards')
    expect(callArg.input).toContain('Tone:')
    expect(callArg.input).toContain('contentType="crm_outreach_tone"')
    expect(callArg.input).toContain('friendly')
    expect(callArg.input).not.toContain('system:')
    expect(callArg.input).not.toContain('assistant:')
  })
})
