ALTER TABLE GroupMember ADD COLUMN AccessLevel TEXT NOT NULL DEFAULT 'Member'
CHECK (AccessLevel IN ('Member', 'Viewer'));
