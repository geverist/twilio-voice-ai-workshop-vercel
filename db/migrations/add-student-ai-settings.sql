-- Migration: Add Student AI Settings Columns
-- Allows students to customize their AI assistant without providing their own OpenAI key

ALTER TABLE workshop_students
ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT DEFAULT 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.',
ADD COLUMN IF NOT EXISTS ai_greeting TEXT DEFAULT 'Hello! How can I help you today?',
ADD COLUMN IF NOT EXISTS ai_voice VARCHAR(50) DEFAULT 'alloy',
ADD COLUMN IF NOT EXISTS ai_tools JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_settings_updated_at TIMESTAMP;

-- Create index for faster lookups when loading student settings
CREATE INDEX IF NOT EXISTS idx_students_ai_updated ON workshop_students(ai_settings_updated_at DESC);

COMMENT ON COLUMN workshop_students.ai_system_prompt IS 'Custom system prompt for the student AI assistant';
COMMENT ON COLUMN workshop_students.ai_greeting IS 'Initial greeting when call connects';
COMMENT ON COLUMN workshop_students.ai_voice IS 'TTS voice selection (alloy, echo, fable, onyx, nova, shimmer)';
COMMENT ON COLUMN workshop_students.ai_tools IS 'JSON array of tool definitions for function calling';
COMMENT ON COLUMN workshop_students.ai_settings_updated_at IS 'Last time student updated their AI settings';
