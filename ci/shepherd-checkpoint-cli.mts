#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { renderCheckpoint, type Checkpoint } from './shepherd-checkpoint.mts'
import { selectResumeCheckpoint } from './shepherd-checkpoint-resume.mts'
import { updateExactCheckpoint } from './shepherd-checkpoint-update.mts'

const USAGE = 'Usage: checkpoint.mts render|select|update <path>'

export function runCheckpointCli(): void {
  const command = process.argv[2]
  if (command === 'render') {
    const checkpoint = JSON.parse(readFileSync(process.argv[3] ?? '', 'utf8')) as Checkpoint
    process.stdout.write(renderCheckpoint(checkpoint))
    return
  }
  const required = (name: string): string => {
    const value = process.env[name]
    if (!value) throw new Error(`${name} is required`)
    return value
  }
  const requiredInteger = (name: string): number => {
    const value = required(name)
    if (!/^[0-9]+$/u.test(value)) throw new Error(`${name} must be a positive integer`)
    return Number(value)
  }
  if (command === 'update') {
    const comment = JSON.parse(readFileSync(process.argv[3] ?? '', 'utf8'))
    const status = required('CHECKPOINT_STATUS')
    if (status !== 'running' && status !== 'failed') throw new Error('CHECKPOINT_STATUS is invalid')
    process.stdout.write(
      updateExactCheckpoint(
        comment,
        {
          actor: required('CHECKPOINT_ACTOR'),
          commentId: requiredInteger('CHECKPOINT_COMMENT_ID'),
          headRef: required('PR_HEAD_REF'),
          headSha: required('PR_HEAD_SHA'),
          pr: requiredInteger('PR_NUMBER'),
          repository: required('GITHUB_REPOSITORY'),
          runId: required('GITHUB_RUN_ID'),
          triggerCommentId: requiredInteger('TRIGGER_COMMENT_ID'),
        },
        status,
        { id: process.env.HARNESS_SESSION_ID, url: process.env.HARNESS_SESSION_URL },
      ),
    )
    return
  }
  if (command !== 'select') throw new Error(USAGE)
  const comments = JSON.parse(readFileSync(process.argv[3] ?? '', 'utf8')) as Parameters<
    typeof selectResumeCheckpoint
  >[0]
  const result = selectResumeCheckpoint(comments, {
    repository: required('GITHUB_REPOSITORY'),
    pr: Number(required('PR_NUMBER')),
    headRef: required('PR_HEAD_REF'),
    headSha: required('PR_HEAD_SHA'),
    actor: required('CHECKPOINT_ACTOR'),
    isAncestor(candidate, head) {
      try {
        const status = execFileSync(
          'gh',
          [
            'api',
            `repos/${required('GITHUB_REPOSITORY')}/compare/${candidate}...${head}`,
            '--jq',
            '.status',
          ],
          { encoding: 'utf8' },
        ).trim()
        return status === 'ahead' || status === 'identical'
      } catch {
        return false
      }
    },
    isShepherdRun(runId) {
      try {
        const verifiedId = execFileSync(
          'gh',
          [
            'api',
            `repos/${required('GITHUB_REPOSITORY')}/actions/runs/${runId}`,
            '--jq',
            'select(.name == "Automation Shepherd" and .event == "issue_comment" and .path == ".github/workflows/shepherd.yml") | .id',
          ],
          { encoding: 'utf8' },
        ).trim()
        return verifiedId === runId
      } catch {
        return false
      }
    },
  })
  process.stdout.write(
    result
      ? JSON.stringify({
          sessionId: result.checkpoint.sessionId,
          commentId: result.commentId,
          startSha: result.checkpoint.startSha,
          sessionStartSha: result.checkpoint.sessionStartSha,
          runId: result.checkpoint.runId,
        })
      : '{}',
  )
}

try {
  runCheckpointCli()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
