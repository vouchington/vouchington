# Sandbox credential deny list

[Back to Agent Sandbox](agent-sandbox.md#sandbox-credential-deny-list)

[`.claude/settings.json`](../../.claude/settings.json) is the runtime list. The table below is
the rationale inventory. The parent section
[Sandbox credential deny list](agent-sandbox.md#sandbox-credential-deny-list) owns the mechanism:
Claude unsets these names before a sandboxed command, and an excluded command still receives them.
[`dev/agent-sandbox-credentials.test.mts`](../../dev/agent-sandbox-credentials.test.mts) requires
the two name sets to stay equal, in the same order. Remove a name only when
[system-dependencies.md](system-dependencies.md), or an equivalent page for the supported local
environments, shows that credential is obsolete. A missing reference in this repository is not
that evidence: a developer shell can export a credential this checkout never reads.

<!-- sandbox-credentials-env-vars -->

| Name                                 | Why a sandboxed command must not receive it                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `AGENT_BLACKBOARD_ADMIN_CREDENTIALS` | Admin credential named by [credential recovery](agent-blackboard.md#credential-recovery).                                      |
| `AGENT_BLACKBOARD_TOKEN`             | Hosted blackboard client credential. The sandboxed SessionStart probe skips instead of treating a withheld token as an outage. |
| `CLAUDE_CODE_OAUTH_TOKEN`            | Ambient Claude Code credential. This checkout does not issue it.                                                               |
| `CLOUDSDK_PROXY_PASSWORD`            | Ambient Google Cloud SDK proxy password. This checkout does not issue it.                                                      |
| `CODEX_FIX_TOKEN`                    | Ambient local credential. This checkout does not issue it.                                                                     |
| `GH_SESSION_TOKEN`                   | Screenshot-upload session token ([Screenshot Upload Credentials](first-party-dependencies.md#screenshot-upload-credentials)).  |
| `GITHUB_PERSONAL_ACCESS_TOKEN`       | Ambient GitHub personal access token. Local `gh` reads `~/.config/gh`.                                                         |
| `SENTRY_AUTH_TOKEN`                  | Source-map upload token used by image publication ([CI](ci.md)). A local shell may export it as well.                          |
| `SONAR_TOKEN`                        | Ambient Sonar token. This checkout does not issue it.                                                                          |
