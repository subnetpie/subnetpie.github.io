CREATE TABLE IF NOT EXISTS profiles (
  profile_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  profile_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disks (
  disk_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  byte_length INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profile_disks (
  profile_id TEXT NOT NULL,
  drive_id TEXT NOT NULL,
  disk_id TEXT NOT NULL,
  overlay_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, drive_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE,
  FOREIGN KEY (disk_id) REFERENCES disks(disk_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS overlay_blocks (
  profile_id TEXT NOT NULL,
  drive_id TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, drive_id, block_number)
);

CREATE INDEX IF NOT EXISTS overlay_blocks_profile_drive
ON overlay_blocks(profile_id, drive_id);
