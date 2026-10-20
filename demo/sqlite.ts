import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { SqlDatabase, SqlStatement } from "../src/persistence/repository";
export class SQLiteDatabase implements SqlDatabase {
  private batchQueue: Promise<unknown> = Promise.resolve();
  raw = new DatabaseSync(":memory:");
  constructor(migrate = true) {
    this.raw.exec("PRAGMA foreign_keys=ON");
    if (migrate)
      for (const file of [
        "0001_foundation.sql",
        "0002_session_hand_count.sql",
        "0003_player_avatar_highlight_amount.sql",
        "0004_media_metadata.sql",
        "0005_anonymous_identity.sql",
        "0006_group_member_access_level.sql",
        "0007_room_governance.sql",
        "0008_media_purpose_byte_limits.sql",
        "0009_fun_engine.sql",
        "0010_table_appeal.sql",
        "0011_account_personalization.sql",
        "0012_reconcile_account_names.sql",
        "0013_highlight_interactions.sql",
        "0014_site_observability.sql",
        "0015_group_rate_presets.sql",
      ])
        this.raw.exec(
          "BEGIN;" +
            readFileSync(
              new URL("../migrations/" + file, import.meta.url),
              "utf8",
            ) +
            ";COMMIT;",
        );
  }
  prepare(sql: string): SqlStatement {
    const statement = this.raw.prepare(sql);
    let values: SQLInputValue[] = [];
    const wrapper: SqlStatement = {
      bind(...args: unknown[]) {
        values = args as SQLInputValue[];
        return wrapper;
      },
      async first<T>() {
        return (statement.get(...values) as T | undefined) || null;
      },
      async all<T>() {
        return { results: statement.all(...values) as T[] };
      },
      async run() {
        return statement.run(...values);
      },
    };
    return wrapper;
  }
  batch(statements: SqlStatement[]) {
    const result = this.batchQueue.then(() => this.atomicBatch(statements));
    this.batchQueue = result.catch(() => {});
    return result;
  }
  private async atomicBatch(statements: SqlStatement[]) {
    this.raw.exec("BEGIN");
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.raw.close();
  }
}
