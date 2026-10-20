-- D1 executes migrations in a transaction. Preserve every existing ID and all
-- NO ACTION foreign-key references while replacing the parent table.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE UserAccount_new (
 Id TEXT PRIMARY KEY,
 GoogleSubjectId TEXT NULL,
 Email TEXT NULL,
 DisplayName TEXT NOT NULL CHECK(length(trim(DisplayName)) > 0),
 CreatedAt TEXT NOT NULL,
 UpdatedAt TEXT NOT NULL,
 CHECK((GoogleSubjectId IS NULL AND Email IS NULL) OR
       (GoogleSubjectId IS NOT NULL AND Email IS NOT NULL))
);
INSERT INTO UserAccount_new (Id,GoogleSubjectId,Email,DisplayName,CreatedAt,UpdatedAt)
 SELECT Id,GoogleSubjectId,Email,DisplayName,CreatedAt,UpdatedAt FROM UserAccount;
DROP TABLE UserAccount;
ALTER TABLE UserAccount_new RENAME TO UserAccount;
CREATE UNIQUE INDEX UserAccount_GoogleIdentity ON UserAccount(GoogleSubjectId)
 WHERE GoogleSubjectId IS NOT NULL;
ALTER TABLE OAuthState ADD COLUMN InitiatingUserId TEXT NULL REFERENCES UserAccount(Id);
-- Bind linking to the initiating session, not just a user ID or client query.
ALTER TABLE OAuthState ADD COLUMN InitiatingSessionHash TEXT NULL;
-- Check actual references before clearing SQLite's deferred DROP TABLE counter.
-- Recreating a parent with identical IDs repairs the references, but SQLite keeps
-- the deferred counter from DROP TABLE until deferral is switched off.
CREATE TABLE IdentityMigrationForeignKeyGuard (Violations INTEGER CHECK(Violations = 0));
INSERT INTO IdentityMigrationForeignKeyGuard
 SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE IdentityMigrationForeignKeyGuard;
PRAGMA defer_foreign_keys = OFF;
