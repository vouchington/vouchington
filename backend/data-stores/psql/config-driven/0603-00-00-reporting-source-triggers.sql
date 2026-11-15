CREATE OR REPLACE TRIGGER trigger_reporting_follow_day AFTER INSERT OR UPDATE OR DELETE ON relation__user__follow__user
  FOR EACH ROW EXECUTE FUNCTION fn_register_vanished_reporting_day('user_follow');
CREATE OR REPLACE TRIGGER trigger_reporting_deleted_user_day AFTER DELETE ON users
  REFERENCING OLD TABLE AS reporting_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_register_reporting_statement_days('user_deletion');
CREATE OR REPLACE TRIGGER trigger_reporting_deleted_post_day AFTER DELETE ON posts
  REFERENCING OLD TABLE AS reporting_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_register_reporting_statement_days('post_deletion');
CREATE OR REPLACE TRIGGER trigger_reporting_deleted_ballot_day AFTER DELETE ON post_votes
  REFERENCING OLD TABLE AS reporting_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_register_reporting_statement_days('post_vote_deletion');
CREATE OR REPLACE TRIGGER trigger_reporting_deleted_action_day AFTER DELETE ON moderator_actions
  REFERENCING OLD TABLE AS reporting_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_register_reporting_statement_days('moderator_action_deletion');
CREATE OR REPLACE TRIGGER trigger_reporting_retained_vote_day AFTER INSERT OR UPDATE OR DELETE ON post_vote_retained_daily_counts
  FOR EACH ROW EXECUTE FUNCTION fn_register_vanished_reporting_day('retained_vote_change');

CREATE OR REPLACE TRIGGER trigger_reporting_historical_ballot_day AFTER INSERT ON post_votes
  REFERENCING NEW TABLE AS reporting_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_register_reporting_statement_days('post_vote_creation');
CREATE OR REPLACE TRIGGER trigger_reporting_historical_action_day AFTER INSERT ON moderator_actions
  REFERENCING NEW TABLE AS reporting_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_register_reporting_statement_days('moderator_action_creation');
