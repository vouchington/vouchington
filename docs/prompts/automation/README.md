# Automation Prompt Templates

These are the prompts the attended triage loop fills in and hands to local subagents. The loop receives events (merge-queue ejections, main CI failures, new Dependabot PRs, and the owner's `/shepherd`, `/plan` and `/fix` comments), verifies each sender's login itself, and dispatches the matching prompt; the prompts therefore carry no trigger-comment or author-association checks. The prompt surface and consumer contract
live in the [prompt catalog](../README.md); scheduled prompts have their single complete list in
[Scheduled prompt catalog](../SCHEDULED.md).

- [CI Failure Core](ci-failure-core.md): shared classify-and-fix rules that Fix Main and Merge Queue
  Ejection inject as `CI_FAILURE_CORE`; not rendered on its own
- [Fix Dependabot](fix-dependabot.md)
- [Fix Issue](fix-issue.md)
- [Fix Main](fix-main.md)
- [Merge Queue Ejection](merge-queue-ejection.md)
- [Plan](plan.md)
- [Scheduled Issue](scheduled-issue.md)
- [Scheduled Prompt](scheduled-prompt.md)
- [Shepherd](shepherd.md)
