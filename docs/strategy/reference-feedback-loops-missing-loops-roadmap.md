# Feedback Loops reference

[Back to Feedback Loops](feedback-loops.md)

## Missing Loops (Roadmap)

### Highest Impact, Lowest Effort

These require no new data infrastructure — just connecting existing signals to the notification and UI systems.

| Loop                                  | What's Missing                                                                            | Issue                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------- |
| **Contribution Impact Notifications** | Data points improve aggregates silently. No "your data changed the approval rate" signal. | jonathanong/filaments#1423 |

### High Impact, Medium Effort

| Loop                              | What's Missing                                                                                                                                                                                         | Issue                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **Weekly Email Digest**           | No email re-engagement channel beyond login magic links.                                                                                                                                               | jonathanong/filaments#1167, jonathanong/filaments#1351 |
| **Contributor Reputation**        | Trust weight is computed but invisible. No public reputation score or impact dashboard.                                                                                                                | jonathanong/filaments#1175                             |
| **Achievement Milestones**        | No progression system. Users have no idea what they're building toward.                                                                                                                                | jonathanong/filaments#1429                             |
| **Post-Onboarding Re-engagement** | Delivered as activity-gated aside widgets: CreateFirstPostAside, FollowTopicsAside, FindPeopleAside, CreateLandingPageAside, DiscoverCommunitiesAside — each hides once the user completes the action. | jonathanong/filaments#1424                             |
| **Community Activity Digest**     | Community owners have no passive awareness of their community's health.                                                                                                                                | jonathanong/filaments#1425                             |

### Strategic (High Effort)

| Loop                              | What's Missing                                                                                  | Issue                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| **Topic Comparison Pages**        | Comparison is the #1 consumer intelligence use case. No comparison UX exists.                   | jonathanong/filaments#1172 |
| **Referral Revenue Attribution**  | Click tracking exists but no estimated revenue. Users can't see the financial value of sharing. | jonathanong/filaments#1426 |
| **Data Network Effect Dashboard** | The flywheel isn't visible. No metrics showing that the platform improves with each user.       | jonathanong/filaments#1427 |
| **Cross-Vertical Trust Transfer** | Trust earned in one vertical doesn't transfer to others. Phase 3 of trust system.               | jonathanong/filaments#1175 |
