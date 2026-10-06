-- Logs the executed plan, with actual row counts and any JIT time, of every test-database statement
-- that runs for one second or longer. The Postgres service log prints at the end of the job. Settings
-- bind to new sessions, so this runs before the Vitest workers connect.
DO $settings$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET session_preload_libraries = %L', current_database(), 'auto_explain');
  EXECUTE format('ALTER DATABASE %I SET auto_explain.log_min_duration = %L', current_database(), '1s');
  EXECUTE format('ALTER DATABASE %I SET auto_explain.log_analyze = %L', current_database(), 'on');
  EXECUTE format('ALTER DATABASE %I SET auto_explain.log_timing = %L', current_database(), 'off');
  EXECUTE format('ALTER DATABASE %I SET auto_explain.log_buffers = %L', current_database(), 'on');
END
$settings$;
