PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  gender TEXT,
  avatar_path TEXT,
  avatar_prompt TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  mari_employee_number TEXT,
  mari_rest_username TEXT,
  mari_rest_password_enc TEXT,
  openai_api_key_enc TEXT,
  openai_model TEXT,
  chat_provider TEXT,
  chat_api_key_enc TEXT,
  chat_base_url TEXT,
  chat_model TEXT,
  google_oauth_client_id TEXT,
  google_oauth_client_secret_enc TEXT,
  notification_prefs TEXT,
  teams_enabled INTEGER,
  organization TEXT,
  can_manage_presence INTEGER NOT NULL DEFAULT 0,
  presence_default_week TEXT,
  mail_sender_blacklist TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

CREATE TABLE IF NOT EXISTS user_module_access (
  user_id INTEGER NOT NULL,
  module TEXT NOT NULL,
  PRIMARY KEY (user_id, module),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_module_access_module ON user_module_access(module);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL DEFAULT 'workbuddy_tick',
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary_json TEXT,
  error_message TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);

CREATE TABLE IF NOT EXISTS job_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  item_kind TEXT NOT NULL,
  external_ref TEXT,
  title TEXT,
  status TEXT NOT NULL,
  message TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES job_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_job_run_items_run ON job_run_items(run_id, id);

CREATE TABLE IF NOT EXISTS mail_analyses (
  user_id INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  subject TEXT,
  from_name TEXT,
  from_email TEXT,
  snippet TEXT,
  status TEXT NOT NULL,
  relevance TEXT,
  summary TEXT,
  analysis_json TEXT,
  suggestion_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  analyzed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'microsoft',
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_mail_analyses_status
  ON mail_analyses(user_id, status, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_analyses_provider_status
  ON mail_analyses(user_id, provider, status, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS mail_sender_prefs (
  user_id INTEGER NOT NULL,
  from_domain TEXT NOT NULL,
  applied_count INTEGER NOT NULL DEFAULT 0,
  dismissed_count INTEGER NOT NULL DEFAULT 0,
  last_applied_at TEXT,
  last_dismissed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, from_domain)
);

CREATE TABLE IF NOT EXISTS mail_applied_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  google_event_id TEXT,
  calendar_id TEXT,
  task_id TEXT,
  reference TEXT,
  start_date TEXT,
  start_time TEXT,
  end_date TEXT,
  provider TEXT NOT NULL DEFAULT 'microsoft',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_applied_links_user
  ON mail_applied_links(user_id, message_id);

CREATE TABLE IF NOT EXISTS mari_ticket_analyses (
  owner_key TEXT NOT NULL,
  issue_id INTEGER NOT NULL,
  summary TEXT,
  analysis_json TEXT NOT NULL,
  images_analyzed INTEGER NOT NULL DEFAULT 0,
  image_names_json TEXT,
  usage_json TEXT,
  model TEXT,
  analyzed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  internal_note_posted_at TEXT,
  PRIMARY KEY (owner_key, issue_id)
);
CREATE INDEX IF NOT EXISTS idx_mari_ticket_analyses_owner_analyzed
  ON mari_ticket_analyses(owner_key, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS mari_time_book_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_key INTEGER NOT NULL DEFAULT 0,
  project_number TEXT NOT NULL,
  project_label TEXT,
  contract_id INTEGER,
  contract_position_id INTEGER,
  activity TEXT NOT NULL,
  memo_text TEXT,
  hours REAL NOT NULL DEFAULT 0.25,
  hours_billable REAL,
  billable INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mari_time_book_favorites_owner
  ON mari_time_book_favorites(owner_key, sort_key, id);

CREATE TABLE IF NOT EXISTS mari_calendar_stamps (
  user_id INTEGER NOT NULL,
  owner_key TEXT NOT NULL,
  event_provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  calendar_id TEXT,
  issue_id INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  start_hm TEXT,
  end_hm TEXT,
  title TEXT NOT NULL,
  memo TEXT,
  hours REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  booked_line_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_owner_pending
  ON mari_calendar_stamps(user_id, status, event_date);
CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_owner_issue
  ON mari_calendar_stamps(user_id, issue_id, event_date);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner
  ON push_subscriptions(owner_key);

CREATE TABLE IF NOT EXISTS ttv_duty (
  ymd TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ttv_duty_user ON ttv_duty(user_id, ymd);

CREATE TABLE IF NOT EXISTS user_absence (
  user_id INTEGER PRIMARY KEY,
  from_ymd TEXT NOT NULL,
  to_ymd TEXT NOT NULL,
  message TEXT,
  outlook_event_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_day_status (
  user_id INTEGER NOT NULL,
  ymd TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  set_by_user_id INTEGER,
  note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, ymd),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(set_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_user_day_status_ymd ON user_day_status(ymd);

-- Teams work inbox. join_url / calendar_event_id: Meeting+transcript later.
-- title / preview / thread_key: search later. inbox=open count: Home later.
CREATE TABLE IF NOT EXISTS teams_thread_state (
  user_id INTEGER NOT NULL,
  thread_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  inbox TEXT NOT NULL,
  title TEXT,
  preview TEXT,
  last_active_at TEXT,
  join_url TEXT,
  calendar_event_id TEXT,
  issue_id INTEGER,
  applied_tasks INTEGER NOT NULL DEFAULT 0,
  applied_events INTEGER NOT NULL DEFAULT 0,
  last_analysis_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_key),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_teams_thread_state_inbox
  ON teams_thread_state(user_id, inbox, last_active_at DESC);

CREATE TABLE IF NOT EXISTS user_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT NOT NULL,
  event TEXT NOT NULL,
  detail_json TEXT,
  session_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created
  ON user_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_event_created
  ON user_activity_log(event, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_log_session_expired
  ON user_activity_log(session_key)
  WHERE event = 'session_expired' AND session_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_activity_sessions (
  session_key TEXT PRIMARY KEY,
  user_id INTEGER,
  username TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_open_expires
  ON user_activity_sessions(expires_at)
  WHERE closed_at IS NULL;
