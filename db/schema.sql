-- Vercel Postgres Schema for Twilio Voice AI Workshop
-- Replace Twilio Sync with reliable Postgres storage

-- Workshop Sessions (replaces Twilio Sync sessions)
CREATE TABLE IF NOT EXISTS workshop_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  account_sid VARCHAR(34),
  auth_token VARCHAR(64),
  api_key_sid VARCHAR(34),
  api_key_secret VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_demo_mode BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sessions_student ON workshop_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON workshop_sessions(expires_at);

-- Workshop Students
CREATE TABLE IF NOT EXISTS workshop_students (
  student_id VARCHAR(64) PRIMARY KEY,
  student_email VARCHAR(255) UNIQUE NOT NULL,
  student_name VARCHAR(255),
  twilio_account_sid VARCHAR(34),
  twilio_phone_number VARCHAR(20),
  openai_api_key_set BOOLEAN DEFAULT FALSE,

  -- Progress tracking
  current_step INTEGER DEFAULT 0,
  exercises_completed INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2) DEFAULT 0.00,

  -- Deployment tracking
  voice_handler_deployed BOOLEAN DEFAULT FALSE,
  websocket_handler_deployed BOOLEAN DEFAULT FALSE,
  github_repo_created BOOLEAN DEFAULT FALSE,
  full_deployment_complete BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  -- Metadata
  total_time_spent INTEGER DEFAULT 0, -- seconds
  validation_failures INTEGER DEFAULT 0,
  demo_mode BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_students_email ON workshop_students(student_email);
CREATE INDEX IF NOT EXISTS idx_students_activity ON workshop_students(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_students_completion ON workshop_students(completion_rate DESC);

-- Workshop Step Progress
CREATE TABLE IF NOT EXISTS workshop_step_progress (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL REFERENCES workshop_students(student_id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(100),

  -- Step tracking
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  time_spent INTEGER DEFAULT 0, -- seconds
  attempts INTEGER DEFAULT 0,
  validation_passed BOOLEAN DEFAULT FALSE,

  -- Code tracking
  code_submitted TEXT,
  validation_errors TEXT,

  UNIQUE(student_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_step_progress_student ON workshop_step_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_step_progress_step ON workshop_step_progress(step_number);

-- Workshop Invitations
CREATE TABLE IF NOT EXISTS workshop_invitations (
  id SERIAL PRIMARY KEY,
  student_email VARCHAR(255) NOT NULL,
  student_name VARCHAR(255),
  workshop_date VARCHAR(50),
  additional_notes TEXT,

  -- Tracking
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_by VARCHAR(255), -- instructor email
  invitation_status VARCHAR(20) DEFAULT 'sent', -- sent, opened, registered, completed

  -- Follow-up
  reminder_sent_at TIMESTAMP,
  registered_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON workshop_invitations(student_email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON workshop_invitations(invitation_status);
CREATE INDEX IF NOT EXISTS idx_invitations_date ON workshop_invitations(sent_at DESC);

-- Workshop Events (for detailed analytics and debugging)
CREATE TABLE IF NOT EXISTS workshop_events (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(64),
  session_id VARCHAR(64),
  event_type VARCHAR(50) NOT NULL, -- session_created, step_started, step_completed, validation_failed, deployment_success, etc.
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_student ON workshop_events(student_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON workshop_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON workshop_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_time ON workshop_events(created_at DESC);

-- View: Active Students (for dashboard)
CREATE OR REPLACE VIEW active_students AS
SELECT
  s.*,
  COUNT(DISTINCT sp.step_number) as steps_completed,
  MAX(sp.completed_at) as last_step_completed
FROM workshop_students s
LEFT JOIN workshop_step_progress sp ON s.student_id = sp.student_id AND sp.completed_at IS NOT NULL
WHERE s.last_activity > NOW() - INTERVAL '7 days'
GROUP BY s.student_id;

-- View: Workshop Analytics Summary
CREATE OR REPLACE VIEW workshop_analytics AS
SELECT
  COUNT(DISTINCT s.student_id) as total_students,
  COUNT(DISTINCT CASE WHEN s.last_activity > NOW() - INTERVAL '1 day' THEN s.student_id END) as active_today,
  COUNT(DISTINCT CASE WHEN s.last_activity > NOW() - INTERVAL '7 days' THEN s.student_id END) as active_week,
  COUNT(DISTINCT CASE WHEN s.completion_rate = 100 THEN s.student_id END) as completed_students,
  COUNT(DISTINCT CASE WHEN s.github_repo_created = TRUE THEN s.student_id END) as repos_created,
  COUNT(DISTINCT CASE WHEN s.voice_handler_deployed = TRUE THEN s.student_id END) as voice_handlers,
  COUNT(DISTINCT CASE WHEN s.websocket_handler_deployed = TRUE THEN s.student_id END) as websocket_handlers,
  COUNT(DISTINCT CASE WHEN s.full_deployment_complete = TRUE THEN s.student_id END) as full_deployments,
  AVG(s.completion_rate) as avg_completion_rate,
  AVG(s.total_time_spent) as avg_time_spent,
  COUNT(DISTINCT CASE WHEN s.demo_mode = TRUE THEN s.student_id END) as demo_mode_users
FROM workshop_students s;

-- Function: Clean up expired sessions (call periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM workshop_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Update student progress
CREATE OR REPLACE FUNCTION update_student_progress(p_student_id VARCHAR(64))
RETURNS VOID AS $$
BEGIN
  UPDATE workshop_students
  SET
    exercises_completed = (SELECT COUNT(*) FROM workshop_step_progress WHERE student_id = p_student_id AND completed_at IS NOT NULL),
    current_step = (SELECT COALESCE(MAX(step_number), 0) FROM workshop_step_progress WHERE student_id = p_student_id AND completed_at IS NOT NULL),
    completion_rate = (SELECT COUNT(*) * 100.0 / 9 FROM workshop_step_progress WHERE student_id = p_student_id AND completed_at IS NOT NULL),
    total_time_spent = (SELECT COALESCE(SUM(time_spent), 0) FROM workshop_step_progress WHERE student_id = p_student_id),
    last_activity = NOW()
  WHERE student_id = p_student_id;
END;
$$ LANGUAGE plpgsql;
