import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
const automationWorkflowPaths = [
  'fix-dependabot.yml',
  'fix-issue.yml',
  'fix-main.yml',
  'harness-dispatch.yml',
  'plan.yml',
  'scheduled-prompts.yml',
  'shepherd.yml',
].map(file => join('.github/workflows', file))

const automationPromptPaths = readdirSync('docs/prompts/automation').map(file =>
  join('docs/prompts/automation', file),
)
const scheduledPromptPaths = readdirSync('docs/prompts/scheduled')
  .filter(file => file.endsWith('.md'))
  .map(file => join('docs/prompts/scheduled', file))
const allPromptPaths = [...automationPromptPaths, ...scheduledPromptPaths]
describe('Harness automation prompt contracts', () => {
  it('uses provider-neutral paths and removes retired completion artifacts', () => {
    for (const path of [...automationWorkflowPaths, ...allPromptPaths]) {
      const text = readFileSync(path, 'utf8')
      expect(text).not.toMatch(/codex-(?:completion|issue|noop|pr)\.(?:json|txt)/u)
    }
    for (const path of [...automationWorkflowPaths, ...allPromptPaths]) {
      expect(readFileSync(path, 'utf8')).not.toContain('trusted publisher')
    }
    expect(automationPromptPaths).toContain('docs/prompts/automation/fix-issue.md')
    expect(automationPromptPaths).toContain('docs/prompts/automation/plan.md')
    expect(automationPromptPaths).toContain('docs/prompts/automation/shepherd.md')
    expect(automationPromptPaths.some(path => /\/codex-/u.test(path))).toBe(false)
  })

  it('keeps public comment commands concise and drops the removed aliases', () => {
    const commandWorkflows = ['fix-issue.yml', 'plan.yml', 'shepherd.yml'].map(file =>
      readFileSync(join('.github/workflows', file), 'utf8'),
    )
    expect(commandWorkflows[0]).toContain("contains(github.event.comment.body, '/fix')")
    expect(commandWorkflows[1]).toContain("contains(github.event.comment.body, '/plan')")
    expect(commandWorkflows[2]).toContain("contains(github.event.comment.body, '/shepherd')")
    expect(commandWorkflows.join('\n')).not.toMatch(/\/codex-(?:fix|plan)/u)
  })

  it('keeps the interactive shepherd plugin distinct from the repository comment trigger', () => {
    const guide = readFileSync(
      'docs/development/reference-merge-authority-why-automation-means-github-actions.md',
      'utf8',
    )

    expect(guide).toContain('`/shepherd`, and scheduled prompts')
    expect(guide).toContain('`/pr-shepherd` from a chat session')
    expect(guide).not.toContain('`/shepherd` from a chat session')
  })

  it('documents default-off scheduled dispatch and its enabled session volume', () => {
    const harnessGuide = readFileSync('.github/workflows/reference-harness-automation.md', 'utf8')

    expect(harnessGuide).toContain('default-off')
    expect(harnessGuide).toContain('HARNESS_DISPATCH_ENABLED')
    expect(harnessGuide).toMatch(/six[^.]*daily|six daily/u)
    expect(harnessGuide).toContain('provider session')
    expect(harnessGuide).not.toContain('auth_mode=chatgpt')
  })

  it('keeps renamed automation provenance and activation documentation synchronized', () => {
    const reviewGuide = readFileSync('.agents/skills/agent-workflow/code-review.md', 'utf8')
    const ciGuide = readFileSync('docs/development/ci.md', 'utf8')
    const checkpointCli = readFileSync('ci/shepherd-checkpoint-cli.mts', 'utf8')

    expect(reviewGuide).toContain('`automation:auto-fix`')
    expect(reviewGuide).toContain('`automation:scheduled`')
    expect(reviewGuide).not.toMatch(/`codex:(?:auto-fix|scheduled)`/u)
    expect(ciGuide).toContain('fire-and-forget sessions through Auto Harness')
    expect(ciGuide).toContain('trusted-host agent')
    expect(ciGuide).not.toContain('Non-Shepherd Codex PR completion')
    expect(ciGuide).not.toContain('Codex Fix Main automatically')
    expect(checkpointCli).toContain('.name == "Automation Shepherd"')
    expect(checkpointCli).not.toContain('.name == "Codex PR Shepherd"')
  })

  it('makes PR labels executable prompt policy instead of metadata-only hints', () => {
    for (const [path, additiveLabel] of [
      ['docs/prompts/automation/fix-main.md', 'automation:auto-fix'],
      ['docs/prompts/automation/fix-issue.md', 'automation:auto-fix'],
      ['docs/prompts/automation/scheduled-prompt.md', 'automation:scheduled'],
    ]) {
      const text = readFileSync(path, 'utf8')
      expect(text).toContain('`automation`')
      expect(text).toContain(`\`${additiveLabel}\``)
    }
  })

  it('keeps issue-only scheduled prompts explicit and provider-neutral', () => {
    for (const path of scheduledPromptPaths) {
      const text = readFileSync(path, 'utf8')
      expect(text).not.toContain('codex-scheduled-completion:')
      expect(text).not.toContain('codex-scheduled-scope:')
    }
    const issuePromptPaths = [
      'docs/prompts/scheduled/ci-job-runtime.md',
      'docs/prompts/scheduled/first-party-dependencies.md',
      'docs/prompts/scheduled/github-issue-hygiene.md',
    ]
    for (const path of issuePromptPaths) {
      expect(readFileSync(path, 'utf8')).toContain('<!-- harness-scheduled-completion: issue -->')
    }
    expect(readFileSync('docs/prompts/scheduled/github-issue-hygiene.md', 'utf8')).toContain(
      '<!-- harness-scheduled-scope: existing-issues -->',
    )
  })

  it('runs Shepherd through the trusted host with exact-head protection', () => {
    const prompt = readFileSync('docs/prompts/automation/shepherd.md', 'utf8')
    const activation = readFileSync('.github/workflows/reference-harness-automation.md', 'utf8')
    const security = readFileSync(
      '.github/workflows/reference-harness-automation-accepted-risk.md',
      'utf8',
    )
    const workflow = readFileSync('.github/workflows/shepherd.yml', 'utf8')

    expect(prompt).toContain('trusted host')
    expect(prompt).toContain('expected head SHA')
    expect(activation).toContain('validated prior checkpoint')
    expect(security).toContain('Shepherd resume')
    expect(workflow).not.toMatch(/PR_(?:STATE_)?SNAPSHOT=/u)
    expect(workflow).not.toContain('/pulls/$PR_NUMBER/files')
  })

  it('binds Dependabot work to the exact live bot-authored branch', () => {
    const prompt = readFileSync('docs/prompts/automation/fix-dependabot.md', 'utf8')
    const activation = readFileSync('.github/workflows/reference-harness-automation.md', 'utf8')
    const security = readFileSync(
      '.github/workflows/reference-harness-automation-accepted-risk.md',
      'utf8',
    )
    const workflow = readFileSync('.github/workflows/fix-dependabot.yml', 'utf8')

    expect(prompt).toContain('authenticated `gh` reads')
    expect(prompt).toContain('Dependabot as its author')
    expect(prompt).toContain('exact lease')
    expect(activation).toContain('exact open bot-authored PR ref/SHA')
    expect(security).toContain('exact target state')
    expect(workflow).not.toMatch(/FAILED_(?:JOB_)?(?:LOG|EVIDENCE)=/u)
    expect(workflow).not.toMatch(/actions\/jobs\/.+\/logs/u)
  })

  it('requires live source evidence and exact revalidation for new-PR Fix Main', () => {
    const prompt = readFileSync('docs/prompts/automation/fix-main.md', 'utf8')
    const activation = readFileSync('.github/workflows/reference-harness-automation.md', 'utf8')
    const security = readFileSync(
      '.github/workflows/reference-harness-automation-accepted-risk.md',
      'utf8',
    )
    const workflow = readFileSync('.github/workflows/fix-main.yml', 'utf8')

    const normalizedPrompt = prompt.replace(/\s+/gu, ' ')
    expect(normalizedPrompt).toContain('authenticated `gh` reads')
    expect(normalizedPrompt).toContain('same run identity/conclusion')
    expect(normalizedPrompt).toContain('one draft PR')
    expect(activation).toContain('exact run/attempt/conclusion')
    expect(security).toContain('source-run identity')
    expect(workflow).toContain("vars.HARNESS_DISPATCH_ENABLED == 'true'")
    expect(workflow).not.toMatch(/FAILED_(?:JOB_)?(?:LOG|EVIDENCE)=/u)
    expect(workflow).not.toMatch(/actions\/jobs\/.+\/logs/u)
  })
  it('bounds direct scheduled issue maintenance and makes it idempotent', () => {
    const text = readFileSync('docs/prompts/automation/scheduled-issue.md', 'utf8')

    expect(text).toContain('idempotent')

    const activation = readFileSync('.github/workflows/reference-harness-automation.md', 'utf8')
    expect(activation.replace(/\s+/gu, ' ')).toContain('50 idempotent mutations')
  })

  it('links the fix-main Refs #N exemption to git-and-prs.md', () => {
    const text = readFileSync('docs/prompts/automation/fix-main.md', 'utf8').replace(/\s+/gu, ' ')

    expect(text).toContain('git-and-prs.md')
  })

  it('gives the unclassified-transient interim classifier a publishable no-closing-ref body', () => {
    const text = readFileSync('docs/prompts/automation/fix-main.md', 'utf8').replace(/\s+/gu, ' ')

    expect(text).toContain(
      'No closing reference; root-cause issue tracked via the Refs entry above.',
    )
    expect(text).toContain(
      '<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->',
    )
    expect(text).toContain('dev/pr-description/validate.mts')
  })

  it('verifies a deferral target repository resolves to its canonical name, however worded', () => {
    for (const path of [
      'docs/prompts/automation/fix-main.md',
      'docs/prompts/automation/scheduled-prompt.md',
    ]) {
      const text = readFileSync(path, 'utf8').replace(/\s+/gu, ' ')
      expect(text).toContain('deferral-target resolution rule')
    }
  })
})
