# Why "automation" means GitHub Actions

[Back to Merge Authority](merge-authority.md#why-automation-means-github-actions)

All automation in this repo runs in GitHub Actions. That covers two contexts:

- **Auto Harness CI** — every `harness-dispatch.yml`-routed prompt: `/fix`, `fix-main`,
  dependabot auto-fix, `/shepherd`, and scheduled prompts (see
  [docs/prompts/automation/](../prompts/README.md)).

An interactive session (a human running Claude Code or Codex CLI locally, or driving
`/pr-shepherd` from a chat session) is a different actor with a different credential: it
authenticates as the human's own `gh` auth, never the CI write token. That distinction — not
"agent vs. human" — is what the hook actually keys on, via
`isAutomationContext(env) = env.GITHUB_ACTIONS === 'true' || env.CI === 'true'`.

**If a merge is unexpectedly blocked (not confirmed) in an interactive session:** the `CI`
fallback is intentionally broad — some local tooling and shell profiles set `CI=true` outside of
GitHub Actions, which is enough to trip `isAutomationContext` and hard-block the merge instead of
asking. Check `echo $CI` in the session's shell before assuming the hook is misbehaving.
