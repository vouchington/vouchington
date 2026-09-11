# Moderation Flow × Persona × Test Matrix reference

[Back to Moderation Flow × Persona × Test Matrix](MODERATION-TEST-MATRIX.md)

## Workstream Key

Labels in the **Status** column identify the workstream that will close each gap.

### A — Build (feature not yet implemented; test blocked until built)

| Label | Description                                                       | Tracking |
| ----- | ----------------------------------------------------------------- | -------- |
| —     | No current build blocker for appeal filing or moderation notices. | —        |

### B — Test (feature exists; Playwright spec missing or incomplete)

| Label | Description                                                                                                                                              | Tracking                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| B1    | SM (site moderator) boundary tests — verify that SM can or cannot take each SA-only action: reports triage, bulk dismiss, suspend, modlog, appeals queue | TBD / not yet open            |
| B2    | Missing e2e specs — mute/block user, blocked/muted list pages, community automod panel, moderation analytics                                             | #5413 (analytics); others TBD |
| B3    | (reserved)                                                                                                                                               | —                             |
| B4    | Member self-service tests — ban/removal appeal submission beyond the currently covered entry-point checks                                                | TBD                           |

### C — Code Gap (UI bug or missing page; tracked in GitHub)

| Label | Description                                                                                                            | Issue |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ----- |
| C1    | Report post flow is available from the post card/detail overflow menu; no dedicated inline entry is currently required | —     |
