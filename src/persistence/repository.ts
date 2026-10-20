// D1 and the test SQLite adapter implement this small persistence boundary.
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<unknown[]>;
}
export class Repository {
  constructor(public db: SqlDatabase) {}
  statement(sql: string, ...values: unknown[]) {
    return this.db.prepare(sql).bind(...values);
  }
  one<T>(sql: string, ...values: unknown[]) {
    return this.statement(sql, ...values).first<T>();
  }
  async many<T>(sql: string, ...values: unknown[]) {
    return (await this.statement(sql, ...values).all<T>()).results;
  }
  run(sql: string, ...values: unknown[]) {
    return this.statement(sql, ...values).run();
  }
  batch(statements: SqlStatement[]) {
    return this.db.batch(statements);
  }
}
