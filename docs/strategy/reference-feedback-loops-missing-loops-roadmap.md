# Feedback Loops reference

[Back to Feedback Loops](feedback-loops.md)

## Missing Loops (Roadmap)

### Highest Impact, Lowest Effort

These require no new data infrastructure — just connecting existing signals to the notification and UI systems.

| Loop                                  | What's Missing                                                                            | Issue                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Contribution Impact Notifications** | Data points improve aggregates silently. No "your data changed the approval rate" signal. | [#1423](https://github.com/jonathanong/filaments/issues/1423) |

### High Impact, Medium Effort

| Loop                              | What's Missing                                                                                                                                                                                         | Issue                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Weekly Email Digest**           | No email re-engagement channel beyond login magic links.                                                                                                                                               | [#1167](https://github.com/jonathanong/filaments/issues/1167), [#1351](https://github.com/jonathanong/filaments/issues/1351) |
| **Contributor Reputation**        | Trust weight is computed but invisible. No public reputation score or impact dashboard.                                                                                                                | [#1175](https://github.com/jonathanong/filaments/issues/1175)                                                                |
| **Achievement Milestones**        | No progression system. Users have no idea what they're building toward.                                                                                                                                | [#1429](https://github.com/jonathanong/filaments/issues/1429)                                                                |
| **Post-Onboarding Re-engagement** | Delivered as activity-gated aside widgets: CreateFirstPostAside, FollowTopicsAside, FindPeopleAside, CreateLandingPageAside, DiscoverCommunitiesAside — each hides once the user completes the action. | [#1424](https://github.com/jonathanong/filaments/issues/1424)                                                                |
| **Community Activity Digest**     | Community owners have no passive awareness of their community's health.                                                                                                                                | [#1425](https://github.com/jonathanong/filaments/issues/1425)                                                                |

### Strategic (High Effort)

| Loop                              | What's Missing                                                                                  | Issue                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Topic Comparison Pages**        | Comparison is the #1 consumer intelligence use case. No comparison UX exists.                   | [#1172](https://github.com/jonathanong/filaments/issues/1172) |
| **Referral Revenue Attribution**  | Click tracking exists but no estimated revenue. Users can't see the financial value of sharing. | [#1426](https://github.com/jonathanong/filaments/issues/1426) |
| **Data Network Effect Dashboard** | The flywheel isn't visible. No metrics showing that the platform improves with each user.       | [#1427](https://github.com/jonathanong/filaments/issues/1427) |
| **Cross-Vertical Trust Transfer** | Trust earned in one vertical doesn't transfer to others. Phase 3 of trust system.               | [#1175](https://github.com/jonathanong/filaments/issues/1175) |
