CREATE TRIGGER record_reporting_follow_day AFTER INSERT OR UPDATE OR DELETE ON relation__user__follow__user
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('user_follow');
CREATE TRIGGER record_reporting_deleted_user_day AFTER DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('user_deletion');
CREATE TRIGGER record_reporting_deleted_post_day AFTER DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('post_deletion');
CREATE TRIGGER record_reporting_deleted_ballot_day AFTER DELETE ON post_votes
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('post_vote_deletion');
CREATE TRIGGER record_reporting_deleted_action_day AFTER DELETE ON moderator_actions
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('moderator_action_deletion');
CREATE TRIGGER record_reporting_retained_vote_day AFTER INSERT OR UPDATE OR DELETE ON post_vote_retained_daily_counts
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('retained_vote_change');

CREATE TRIGGER record_reporting_historical_ballot_day AFTER INSERT ON post_votes
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('post_vote_creation');
CREATE TRIGGER record_reporting_historical_action_day AFTER INSERT ON moderator_actions
  FOR EACH ROW EXECUTE FUNCTION record_vanished_reporting_day('moderator_action_creation');
