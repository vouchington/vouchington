import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ready = readFileSync('.agents/skills/ready-and-shepherd/SKILL.md', 'utf8')
const triage = readFileSync('.agents/skills/triage-prs/SKILL.md', 'utf8')
const securityTriagePath = '.agents/skills/triage-security/SKILL.md'
const securityTriage = readFileSync(securityTriagePath, 'utf8')
const gitAndPrs = readFileSync('.agents/skills/agent-workflow/git-and-prs.md', 'utf8')

describe('ready-and-shepherd local shepherding boundary', () => {
  it('shepherds locally and never posts a comment trigger or reads dispatch gates', () => {
    for (const source of [ready, triage]) {
      expect(source).not.toContain('HARNESS_')
      expect(source).not.toContain("-f body='/shepherd'")
      expect(source).not.toContain('shepherd-checkpoint')
    }
    expect(ready).toContain('Shepherd locally')
    expect(ready).toContain('Never run two shepherds on the same PR')
    expect(triage).toContain('Shepherding is local')
  })

  it('allows only the Vouchington security-triage adapter to use the provider-local handoff', () => {
    const flag = '--codex-security-local-handoff'

    // The static guidance check owns the "no other skill file" inventory.
    expect(ready).toContain(flag)
    expect(securityTriage).toContain(`<N> ${flag}`)
    expect(securityTriage).toContain("`execution.status: 'completed'`")
    expect(securityTriage).toContain('security-triage')
    expect(triage).not.toContain(flag)
  })

  it('limits the security-triage handoff to ready and label mutations', () => {
    const start = ready.indexOf('codex_security_local_handoff=false')
    const end = ready.indexOf('## Step 3')
    const handoffBranch = ready.slice(start, end)
    const mutations = handoffBranch
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^(?:gh pr (?:ready|edit|comment|merge)|gh api -X POST)\b/u.test(line))

    expect(mutations).toEqual([
      'gh pr ready <N> || exit 1',
      'gh pr edit <N> --add-label automation || exit 1',
    ])
    expect(handoffBranch).toContain('Security-triage local handoff requires an open PR.')
    expect(handoffBranch).toContain('Security-triage local handoff verification failed.')
    expect(handoffBranch).toContain('any(.labels[]; .name == "automation")')
    expect(handoffBranch).toContain('Security-triage local handoff cannot steer or arm auto-merge.')
  })

  it('keeps batch triage free of deferred-arm draining', () => {
    expect(triage).not.toContain('deferred-arm list')
    expect(triage).not.toContain('Pass B')
  })

  it('documents the trusted-host boundary without the retired publisher exception', () => {
    expect(gitAndPrs).not.toContain('Automation exception')
  })
})
