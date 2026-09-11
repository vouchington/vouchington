import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readFrictionLog } from 'vouchington-tooling/session-friction'

import { frictionLogDirectory } from '../config.mts'
import { recordFriction, recordPermissionRequestFriction } from '../record.mts'

const testDirs: string[] = []

function makeEnv(): NodeJS.ProcessEnv {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'session-friction-record-')))
  testDirs.push(directory)
  return { TMPDIR: directory }
}

function read(sessionId: string, env: NodeJS.ProcessEnv) {
  return readFrictionLog(sessionId, { directory: frictionLogDirectory(env) })
}

describe('recordFriction', () => {
  afterEach(() => {
    testDirs.splice(0).forEach(directory => rmSync(directory, { force: true, recursive: true }))
  })

  it('does nothing when no session id can be resolved', () => {
    const env = makeEnv()
    recordFriction({ tool_input: { command: 'git push', dangerouslyDisableSandbox: true } }, env)
    expect(existsSync(frictionLogDirectory(env))).toBe(false)
  })

  it('records a clean observation when nothing classifies', () => {
    const env = makeEnv()
    recordFriction({ session_id: 'sess-1', tool_input: { command: 'pnpm exec vitest run' } }, env)
    expect(read('sess-1', env)).toEqual({ status: 'empty' })
  })

  it('maps an escalated hook payload to the shared recorder', () => {
    const env = makeEnv()
    recordFriction(
      {
        session_id: 'sess-1',
        tool_input: { command: 'git push', dangerouslyDisableSandbox: true },
      },
      env,
    )
    expect(read('sess-1', env)).toMatchObject({
      status: 'events',
      events: [{ kind: 'sandbox-escalation', commandPrefix: 'git push' }],
    })
  })

  it('uses only structured stderr for failure classification', () => {
    const env = makeEnv()
    recordFriction(
      {
        session_id: 'structured',
        tool_input: { command: 'git push' },
        tool_response: { stderr: 'Operation not permitted' },
      },
      env,
    )
    recordFriction(
      {
        session_id: 'string',
        tool_input: { command: 'git push' },
        tool_response: 'Operation not permitted',
      },
      env,
    )
    expect(read('structured', env).status).toBe('events')
    expect(read('string', env)).toEqual({ status: 'empty' })
  })
})

describe('recordPermissionRequestFriction', () => {
  afterEach(() => {
    testDirs.splice(0).forEach(directory => rmSync(directory, { force: true, recursive: true }))
  })

  it('records Bash permission requests but not command-shaped non-shell prompts', () => {
    const env = makeEnv()
    recordPermissionRequestFriction(
      { session_id: 'bash', tool_input: { command: 'git push' }, tool_name: 'Bash' },
      env,
    )
    recordPermissionRequestFriction(
      { session_id: 'mcp', tool_input: { command: 'git push' }, tool_name: 'some_mcp_tool' },
      env,
    )
    expect(read('bash', env)).toMatchObject({
      status: 'events',
      events: [{ kind: 'sandbox-escalation', detail: 'permission-request' }],
    })
    expect(read('mcp', env)).toEqual({ status: 'empty' })
  })
})
