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
