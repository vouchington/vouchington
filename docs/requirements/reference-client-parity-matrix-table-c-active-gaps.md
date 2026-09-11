# Client Parity Matrix reference

[Back to Client Parity Matrix](CLIENT-PARITY-MATRIX.md)

## Table C — Active Gaps

Milestone: [Native client (Swift + .NET) feature parity with web][milestone]. This table contains
active gaps only; closed implementation history belongs in issues and git history.

Phases express delivery order: Phase 1 covers foundational member experience, Phase 2 covers
content and personal-data workflows, and Phase 3 covers advanced platform, billing, and staff
operations. The linked issue remains the authority for implementation scope and sequencing within
each phase.

| #   | Capability / Domain                            | Feature ID             | Client(s)    | Current state                                                                                                                                                                                                                                                                                                                      | Phase | Issue                  |
| --- | ---------------------------------------------- | ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------- |
| 1   | Store billing and subscription management      | billing                | Swift + .NET | Present: native clients render plan status without store billing or management.                                                                                                                                                                                                                                                    | 3     | [#6582]                |
| 2   | YouTube/Vimeo embed-only video playback        | embed-only-media       | Swift + .NET | None on main: supported embeds display unavailable. A narrow provider-only WebView exception is approved; Open source remains separate.                                                                                                                                                                                            | 2     | [clients#57]           |
| 3   | Localized client UI                            | localization           | Swift + .NET | None: visible native copy remains hardcoded rather than localized UI.                                                                                                                                                                                                                                                              | 1     | [#7892]                |
| 4   | Notification settings route and focus behavior | notification-settings  | Swift + .NET | Partial: web and Swift prove all eight mutations and canonical inbox routing; Swift's app-shell XCUITest covers route activation, heading presentation, and exactly-once accessibility activation. .NET proves the equivalent Core and realized-control behavior, but its non-skipping Mac Catalyst app-shell run remains [#8625]. | 1     | [#8600]                |
| 5   | Authored contribution admission                | contribution-admission | Swift + .NET | Plumb staged in Filaments: all authored create surfaces use a UUID `Idempotency-Key`, replay preserves the original result, and 409/429 responses retain drafts without quota or Safety details. Native localized and accessible UI evidence is owned by the dependent clients draft.                                              | 1     | [#10619], [clients#92] |

## Synchronization rule

When functional UI, intent placement, requirements, or evidence changes, coordinate linked
Filaments and `vouchington/vouchington-clients` PRs. Filaments stages
`client-feature-parity.json`, this matrix, the relevant intent catalog, and `api-fixtures/v1/` when
an endpoint or response-shape change requires it; the client PR then supplies executable behavioral
or explicitly declared source-audit evidence against that staged contract. The contract is
authoritative at capability level; Tables A and B are summaries and must not claim full parity when
any mapped capability differs from web.

[milestone]: https://github.com/jonathanong/filaments/milestone/13
[#6582]: https://github.com/jonathanong/filaments/issues/6582
[clients#57]: https://github.com/vouchington/vouchington-clients/issues/57
[#7892]: https://github.com/jonathanong/filaments/issues/7892
[#8600]: https://github.com/jonathanong/filaments/issues/8600
[#8625]: https://github.com/jonathanong/filaments/issues/8625
[#10619]: https://github.com/jonathanong/filaments/issues/10619
[clients#92]: https://github.com/vouchington/vouchington-clients/issues/92
