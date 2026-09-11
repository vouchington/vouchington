# Complete Tool Inventory

[Back to Agents Architecture](README.md#complete-tool-inventory)

### Chat orchestrator ([`chat/`](chat/))

| Tool                  | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `run_research_agent`  | Deep research — broad questions needing multiple searches       |
| `run_profile_agent`   | Profile management — update wallet, spending, financial profile |
| `run_discovery_agent` | Discovery — trending topics/posts, personalized recommendations |
| `search_topics`       | Quick topic ID lookup                                           |
| `get_my_profile`      | Quick profile/wallet check                                      |

### Research agent ([`research-agent/`](research-agent/)) — 13 tools

| Tool                     | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `search_topics`          | Look up topic IDs by name                               |
| `get_topic_details`      | Card attributes: annual fee, issuer, brand, description |
| `get_topic_hierarchy`    | Parent/child topics — find all cards from an issuer     |
| `search_data_points`     | User-reported approval odds, credit limits              |
| `get_topic_insights`     | Aggregate approval rates, credit score distributions    |
| `get_topic_metrics`      | Engagement counts (discussions, reviews) and ratings    |
| `compare_topics`         | Side-by-side card comparison                            |
| `get_referral_links`     | Referral links when recommending a card                 |
| `search_posts`           | Community discussions and reviews                       |
| `search_crawls`          | External web content — editorial reviews                |
| `search_crawls_semantic` | Semantic web content search                             |
| `search_rss_feed_items`  | Recent RSS feed articles                                |
| `get_wikipedia_summary`  | Wikipedia background context                            |

### Discovery agent ([`discovery-agent/`](discovery-agent/)) — 5 tools

| Tool                     | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `get_trending_topics`    | Top trending topics by time range (day/week/month)      |
| `get_trending_posts`     | Top trending posts by time range and type               |
| `get_recommended_topics` | Personalized topic recommendations for the current user |
| `search_topics`          | Look up topic IDs by name                               |
| `get_topic_details`      | Card attributes to enrich discovery results             |

### Profile agent ([`profile-agent/`](profile-agent/)) — 7 tools

| Tool                          | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `get_my_profile`              | Read current wallet and financial profile         |
| `update_my_financial_profile` | Update credit score, income, etc.                 |
| `manage_my_cards`             | Add/remove cards from wallet                      |
| `manage_my_point_valuations`  | Set point valuations for rewards programs         |
| `manage_my_rewards_statuses`  | Set rewards program status (Gold, Platinum, etc.) |
| `manage_my_spending`          | Update monthly spending by category               |
| `search_topics`               | Find topic IDs when resolving card names          |
