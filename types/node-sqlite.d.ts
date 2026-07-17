declare module "node:sqlite" {
  export interface StatementSync {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(...params: any[]): unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run(...params: any[]): unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all(...params: any[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
