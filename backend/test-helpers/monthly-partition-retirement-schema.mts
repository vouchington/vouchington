/** Minimal owned-schema counterparts of the production retention FK graph. */
export const MONTHLY_RETIREMENT_SCHEMA = `
CREATE TABLE crawls (id uuid PRIMARY KEY) PARTITION BY RANGE (id);
CREATE TABLE crawls__p_2019_01 PARTITION OF crawls FOR VALUES FROM (MINVALUE) TO ('10000000-0000-7000-8000-000000000000');
CREATE TABLE crawl_chunks (
  crawl_id uuid REFERENCES crawls ON DELETE CASCADE,
  order_index int NOT NULL, PRIMARY KEY (crawl_id, order_index)
) PARTITION BY RANGE (crawl_id);
CREATE TABLE crawl_chunks__p_2019_01 PARTITION OF crawl_chunks FOR VALUES FROM (MINVALUE) TO ('10000000-0000-7000-8000-000000000000');
CREATE TABLE bedrock_embeddings_batches (id text PRIMARY KEY, crawl_id uuid REFERENCES crawls ON DELETE SET NULL);
CREATE TABLE bedrock_embeddings_batch_entities (
  batch_id text REFERENCES bedrock_embeddings_batches ON DELETE CASCADE,
  crawl_id uuid, crawl_order_index int,
  FOREIGN KEY (crawl_id, crawl_order_index) REFERENCES crawl_chunks ON DELETE CASCADE
);
CREATE TABLE user_referral_program_links (id uuid PRIMARY KEY, last_crawl_id uuid REFERENCES crawls ON DELETE SET NULL);
CREATE TABLE rss_feed_crawls (id uuid PRIMARY KEY) PARTITION BY RANGE (id);
CREATE TABLE rss_feed_crawls__p_2019_01 PARTITION OF rss_feed_crawls FOR VALUES FROM (MINVALUE) TO (MAXVALUE);
INSERT INTO crawls VALUES ('00000000-0000-7000-8000-000000000001');
INSERT INTO crawl_chunks VALUES ('00000000-0000-7000-8000-000000000001', 0);
INSERT INTO bedrock_embeddings_batches VALUES ('owned-batch', '00000000-0000-7000-8000-000000000001');
INSERT INTO bedrock_embeddings_batch_entities VALUES ('owned-batch', '00000000-0000-7000-8000-000000000001', 0);
INSERT INTO user_referral_program_links VALUES ('10000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000001');
`
