// File-classification policy for issue #10956's shell-quoting guard: which tracked paths in this
// repo count as a shell script or a workflow/composite-action YAML file worth scanning. The
// detection itself — the shell-argument scanner and the YAML `run:`-block decoder — was extracted
// to vouchington-tooling/gh-api-shell-quoting (issue #10956 follow-up, vouchington-tooling#182)
// since it carries no Filaments-specific identifiers; only this file-universe decision stays local,
// since vouchington-tooling already ships its own unrelated file-classification module
// (`gha-workspace-policy`) and has no reason to own this repo's layout.
export type { ShellQuotingViolation } from 'vouchington-tooling/gh-api-shell-quoting'
export {
  shellScriptViolations,
  workflowYamlViolations,
} from 'vouchington-tooling/gh-api-shell-quoting'

// GitHub accepts both `.yml` and `.yaml` for workflows and composite actions (issue #10956 review).
// Workflow files sit directly under `.github/workflows/`; composite actions nest under
// `.github/actions/**/action.{yml,yaml}` at any depth.
const WORKFLOW_FILE_RE = /^\.github\/workflows\/[^/]+\.ya?ml$/
const ACTION_FILE_RE = /^\.github\/actions\/.+\.ya?ml$/
const SHELL_SCRIPT_FILE_RE = /^ci\/.+\.sh$/
// Tracked, executable, `#!/usr/bin/env bash` entrypoints under ci/ that don't end in `.sh` — named
// individually rather than widening SHELL_SCRIPT_FILE_RE to shebang/executable-bit sniffing, which
// would change the guard's file-universe contract for every consumer (issue #10956 review).
const SHELL_SCRIPT_FILE_ALLOWLIST: ReadonlySet<string> = new Set(['ci/with-node-test-options'])

export function isGhApiWorkflowFile(file: string): boolean {
  return WORKFLOW_FILE_RE.test(file) || ACTION_FILE_RE.test(file)
}

export function isGhApiShellScriptFile(file: string): boolean {
  return SHELL_SCRIPT_FILE_RE.test(file) || SHELL_SCRIPT_FILE_ALLOWLIST.has(file)
}
