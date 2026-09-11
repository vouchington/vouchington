import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { computeTranscriptFactsFromFiles } from '../compute-stream.mts'
import { computeTranscriptFacts } from '../compute.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'compute-stream-'))
  testDirs.push(dir)
  return dir
}

async function makeTranscript(name: string, lines: string[]): Promise<string> {
  const dir = await makeTempDir()
  const path = join(dir, name)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8')
  return path
}

function line(record: unknown): string {
  return JSON.stringify(record)
}

describe('computeTranscriptFactsFromFiles', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('streams Claude sibling files sequentially while deduplicating UUIDs across files', async () => {
    const main = await makeTranscript('main.jsonl', [
      line({ type: 'user', uuid: 'duplicated', message: { content: 'main prompt' } }),
    ])
    const sibling = await makeTranscript('sibling.jsonl', [
      line({ type: 'user', uuid: 'duplicated', message: { content: 'replayed prompt' } }),
      line({
        type: 'assistant',
        isSidechain: true,
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      }),
    ])

    await expect(computeTranscriptFactsFromFiles(main, [sibling])).resolves.toEqual({
      facts: expect.objectContaining({ userPrompts: 1, toolCalls: 1, subagentToolCalls: 1 }),
    })
  })

  it('keeps Codex failure correlation exact without retaining call ids in memory', async () => {
    const path = await makeTranscript('codex.jsonl', [
      line({ type: 'session_meta', payload: {} }),
      ...Array.from({ length: 128 }, (_, index) =>
        line({
          type: 'response_item',
          payload: {
            type: 'custom_tool_call_output',
            status: 'failed',
            call_id: `call-${index % 2}`,
          },
        }),
      ),
    ])

    await expect(computeTranscriptFactsFromFiles(path)).resolves.toEqual({
      facts: expect.objectContaining({ failedToolCalls: 2 }),
    })
  })

  it('matches the established Claude facts for messages, advisors, commands, and UUID replays', async () => {
    const main = [
      line({ type: 'user', uuid: 'prompt', message: { content: 'main prompt' } }),
      line({
        type: 'assistant',
        uuid: 'assistant',
        message: {
          usage: { input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 2 },
          content: [
            { type: 'server_tool_use', id: 'advisor-1', name: 'advisor', input: {} },
            { type: 'tool_use', name: 'Bash', input: { command: 'git push origin HEAD' } },
          ],
        },
      }),
    ]
    const child = [
      main[0],
      line({
        type: 'assistant',
        isSidechain: true,
        message: {
          content: [{ type: 'advisor_tool_result', tool_use_id: 'advisor-1' }],
          usage: { input_tokens: 7, output_tokens: 4, cache_creation_input_tokens: 9 },
        },
      }),
    ]
    const mainPath = await makeTranscript('claude-main.jsonl', main)
    const childPath = await makeTranscript('claude-child.jsonl', child)

    await expect(computeTranscriptFactsFromFiles(mainPath, [childPath])).resolves.toEqual({
      facts: computeTranscriptFacts([...main, ...child]),
    })
  })

  it('matches the established Codex facts for messages, token deltas, compactions, commands, and failures', async () => {
    const lines = [
      line({ type: 'session_meta', payload: {} }),
      line({ type: 'event_msg', payload: { type: 'user_message' } }),
      line({ type: 'event_msg', payload: { type: 'agent_message' } }),
      line({
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: JSON.stringify({ cmd: 'pnpm run no-mistakes\ngit push' }),
        },
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call', status: 'failed', call_id: 'failed-call' },
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', status: 'failed', call_id: 'failed-call' },
      }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 4 },
          },
        },
      }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 7, output_tokens: 8, cached_input_tokens: 2 },
          },
        },
      }),
      line({ type: 'event_msg', payload: { type: 'context_compacted' } }),
      line({ type: 'compacted', payload: {} }),
      line({ type: 'compacted', payload: {} }),
    ]
    const path = await makeTranscript('codex-parity.jsonl', lines)

    await expect(computeTranscriptFactsFromFiles(path)).resolves.toEqual({
      facts: computeTranscriptFacts(lines),
    })
  })

  it('removes every injected temp-root directory after success and schema errors', async () => {
    const tempRoot = await makeTempDir()
    const success = await makeTranscript('success.jsonl', [
      line({ type: 'user', message: { content: 'ok' } }),
    ])
    const mixed = await makeTranscript('mixed.jsonl', [
      line({ type: 'user', message: { content: 'Claude' } }),
      line({ type: 'session_meta', payload: {} }),
    ])

    await expect(
      computeTranscriptFactsFromFiles(success, [], { tempRoot }),
    ).resolves.toHaveProperty('facts')
    await expect(readdir(tempRoot)).resolves.toEqual([])
    await expect(computeTranscriptFactsFromFiles(mixed, [], { tempRoot })).resolves.toEqual({
      error: 'mixed Claude and Codex transcript schemas',
    })
    await expect(readdir(tempRoot)).resolves.toEqual([])
  })
})
