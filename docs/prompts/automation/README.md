# Automation Prompt Templates

These templates are rendered by Auto Harness workflows. The prompt surface and consumer contract
live in the [prompt catalog](../README.md); scheduled prompts have their single complete list in
[Scheduled prompt catalog](../SCHEDULED.md). The dispatcher prepends the shared
`vouchington-tooling` MCP preflight to every rendered prompt, so templates never restate it; see
[Client contract](../../development/ci/workflows/reference-harness-automation.md#client-contract).

- [Fix Dependabot](fix-dependabot.md)
- [Fix Issue](fix-issue.md)
- [Fix Main](fix-main.md)
- [Merge Queue Ejection](merge-queue-ejection.md)
- [Plan](plan.md)
- [Scheduled Issue](scheduled-issue.md)
- [Scheduled Prompt](scheduled-prompt.md)
- [Shepherd](shepherd.md)
