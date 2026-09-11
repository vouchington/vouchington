# Trust System reference

[Back to Trust System](trust-system.md)

## Bot Defense Through Trust

The trust system is inherently anti-bot. Bot accounts fail to accumulate trust through multiple reinforcing mechanisms:

| Mechanism                | Why Bots Fail                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Low vote accuracy**    | Bots vote randomly or in coordinated patterns that diverge from moderator consensus      |
| **No social graph**      | Bot accounts aren't followed by real users, so their referral links never rank highly    |
| **Contribution gating**  | 7-day posting/rating wait and initial review queue delay bot operations                  |
| **Behavioral detection** | Non-human submission patterns (velocity, timing, data consistency) trigger reduced trust |
| **Community flagging**   | Real users flag suspicious accounts; trust-weighted flags are more effective             |

The result: **bot accounts naturally accumulate near-zero trust weight**. Their votes don't move rankings. Their data points don't affect aggregates. Their referral links don't surface. The trust system IS the bot defense — no separate bot detection system needed.
