-- Read watermarks for the booking chat.
--
-- One row per (booking, participant) holding the newest message timestamp that
-- reader has seen. Unread is then a count of the other side's messages newer
-- than the watermark, which keeps the write on *opening* a thread rather than
-- on every message, and costs nothing for participants who never opened it.
CREATE TABLE booking_message_reads (
  booking_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (booking_id, user_id)
);
CREATE INDEX idx_booking_message_reads_user ON booking_message_reads(user_id);
