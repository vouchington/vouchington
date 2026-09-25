import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ready = readFileSync('.agents/skills/ready-and-shepherd/SKILL.md', 'utf8')
const triage = readFileSync('.agents/skills/triage-prs/SKILL.md', 'utf8')
const securityTriagePath = '.agents/skills/triage-security/SKILL.md'
const securityTriage = readFileSync(securityTriagePath, 'utf8')
const gitAndPrs = readFileSync('.agents/skills/agent-workflow/git-and-prs.md', 'utf8')

const skillMarkdownPaths = readdirSync('.agents/skills', { recursive: true })
  .map(path => join('.agents/skills', String(path)))
  .filter(path => path.endsWith('.md'))
  .sort()

describe('ready-and-shepherd activation boundary', () => {
  it('fails closed before generic GitHub mutations when Harness dispatch is disabled', () => {
    const preflight = 'gh variable get HARNESS_DISPATCH_ENABLED'
    const shepherdPreflight = 'gh variable get HARNESS_SHEPHERD_ENABLED'
    const disabled =
      '[ "$harness_dispatch_enabled" != "true" ] || [ "$harness_shepherd_enabled" != "true" ]'
    const firstMutation = 'gh pr comment <N> --body-file "$steering_file"'

    expect(ready).toContain(preflight)
    expect(ready).toContain(shepherdPreflight)
    expect(ready).toContain(disabled)
    expect(ready.indexOf(preflight)).toBeLessThan(ready.indexOf(firstMutation))
    expect(ready.indexOf(shepherdPreflight)).toBeLessThan(ready.indexOf(firstMutation))
    for (const mutation of [
      'gh pr ready <N>',
      'gh pr edit <N> --add-label automation',
      'gh pr merge <N> --auto --squash',
      `-f body='/shepherd'`,
    ]) {
      expect(ready.indexOf(disabled)).toBeLessThan(ready.indexOf(mutation))
    }
    // '/shepherd dispatched' is a de facto report-field identifier that recurs across every
    // activation-outcome branch in the skill (see #10813/#11019: don't pin the reason text next to
    // it — that's reworded prose, not the identifier).
    expect(ready).toContain('/shepherd dispatched')
  })

  it('allows only the Vouchington security-triage adapter to use the disabled provider-local handoff', () => {
    const flag = '--codex-security-local-handoff'
    const filesWithFlag = skillMarkdownPaths.filter(path =>
      readFileSync(path, 'utf8').includes(flag),
    )

    expect(filesWithFlag).toEqual([
      '.agents/skills/ready-and-shepherd/SKILL.md',
      securityTriagePath,
    ])
    expect(securityTriage).toContain(`<N> ${flag}`)
    expect(securityTriage).toContain("`execution.status: 'completed'`")
    expect(securityTriage).toContain('security-triage')
    expect(triage).not.toContain(flag)
  })

  it('limits the disabled security-triage handoff to ready and label mutations', () => {
    const start = ready.indexOf('codex_security_local_handoff=false')
    const end = ready.indexOf('### Security-triage provider-local handoff')
    const disabledBranch = ready.slice(start, end)
    const mutations = disabledBranch
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^(?:gh pr (?:ready|edit|comment|merge)|gh api -X POST)\b/u.test(line))

    expect(mutations).toEqual([
      'gh pr ready <N> || exit 1',
      'gh pr edit <N> --add-label automation || exit 1',
    ])
    expect(disabledBranch).toContain('Security-triage local handoff requires an open PR.')
    expect(disabledBranch).toContain('Security-triage local handoff verification failed.')
    expect(disabledBranch).toContain('any(.labels[]; .name == "automation")')
    expect(disabledBranch).toContain(
      'Security-triage local handoff cannot steer or arm auto-merge.',
    )
    expect(disabledBranch).toContain('Harness shepherd dispatch remains disabled.')
    expect(disabledBranch).not.toContain("body='/shepherd'")
    expect(disabledBranch).not.toContain('shepherd-checkpoint-cli')
  })

  it('keeps batch triage unchanged and removes terminal checkpoint draining', () => {
    expect(triage).toContain('activation disabled — unchanged')
    expect(triage).toContain('`HARNESS_SHEPHERD_ENABLED`')
    expect(triage).not.toContain('deferred-arm list')
    expect(triage).not.toContain('Pass B')
  })

  it('documents the trusted-host boundary without the retired publisher exception', () => {
    expect(gitAndPrs).not.toContain('Automation exception')
  })
})
