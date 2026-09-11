# Engagement / Retention (14 loops)

[Back to Feedback Loops reference](reference-feedback-loops-existing-loops.md)

| Loop                                          | Mechanism                                                                                                                                                         | Status |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Notification Re-engagement**                | Post/comment triggers auto-subscribe, reply notification pulls user back, counter-notification continues the cycle                                                | Built  |
| **New Follower Notifications**                | Following a user notifies the followed person; motivates mutual-follow and reciprocal contribution                                                                | Built  |
| **Referral Signup Notifications**             | When a referred user signs up, the referrer is notified; closes the "did my link work?" loop                                                                      | Built  |
| **Referral Click Notifications**              | When a visitor clicks a referral link, the owner is notified (5-min debounced). Reinforces link-sharing behavior.                                                 | Built  |
| **Personalized Feed**                         | Follow users + topics, curated feed delivers relevant content, engagement drives more follows                                                                     | Built  |
| **Social Proof**                              | "From People You Follow" modules show friends' votes on posts/topics                                                                                              | Built  |
| **Trending Discovery**                        | Votes drive trending score (3-day half-life), trending page drives more eyeballs and votes                                                                        | Built  |
| **News/RSS Feed**                             | Follow sources, clustered stories create daily return habit                                                                                                       | Built  |
| **Share/Send to Followers**                   | Users broadcast content to followers' feeds and notification inboxes                                                                                              | Built  |
| **Friend/Collaborative RSS Feed Recommender** | 3-source weighted recommender (friends 3.0×, topic 2.5×, collaborative 2.0×) suggests RSS feeds to follow; more follows → more sessions                           | Built  |
| **Story Clustering**                          | `@story-teller` agent clusters RSS items into event-based stories; daily news cycle creates a structured return habit beyond per-feed follows                     | Built  |
| **Post-Mention Entity Relations**             | `@user`, `#topic`, `!post` mentions create graph edges; mentioned content surfaces under each entity, giving mentioners distribution and draw for mentioned users | Built  |
| **Web Push Delivery**                         | VAPID-based browser push delivers notifications even when the tab is closed; re-engages users who've left the session                                             | Built  |
| **Recently Viewed Recommendations**           | Viewing topics/posts feeds the recommendation engine                                                                                                              | Built  |
