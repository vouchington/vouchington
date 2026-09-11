# Growth / Acquisition (8 loops)

[Back to Feedback Loops reference](reference-feedback-loops-existing-loops.md)

| Loop                             | Mechanism                                                                                                                                                                                     | Status          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Landing Page Viral**           | User creates `@username` page with referral links, shares on social media, visitors sign up and create their own pages                                                                        | Core flywheel   |
| **SEO Content**                  | Structured data + reviews create indexed pages, organic traffic brings contributors who add more data                                                                                         | Built           |
| **Sign-Up Attribution**          | `session_referral_attributions` tracks referrer; referrer gets priority group 3 in referral link ranking                                                                                      | Built           |
| **OAuth Friend Discovery**       | Connect Facebook/X/GitHub, find existing friends, bootstrap social graph                                                                                                                      | Built           |
| **LLM Discovery**                | `/llms.txt` + `/md/*` routes make content available to AI crawlers                                                                                                                            | Built (passive) |
| **Prioritized Referral Ranking** | Referral links sorted into 6 priority groups (circle → extended network → attributed referrers → community → community friends → community others); referrers who convert get tier-3 priority | Built           |
| **Referral-Link Auto-Pruning**   | Crawler checks referral links; HTTP 404/410 → immediate deactivation; 3 consecutive failures → deactivate. Dead links pruned without manual maintenance.                                      | Built           |
| **Wikipedia Topic Seeder**       | Wikipedia crawler proposes new topics; admin approval materializes them as live SEO pages. Expands topic surface area without human ideation.                                                 | Built           |
