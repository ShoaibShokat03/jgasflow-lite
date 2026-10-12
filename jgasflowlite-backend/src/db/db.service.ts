import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { ENV } from '../config/env';
import { migrate } from './schema';

/** Anything that can run SQL: the pool, or one connection inside a transaction. */
export interface Q {
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<ResultSetHeader>;
}

class ConnQ implements Q {
  constructor(private readonly c: Pool | PoolConnection) {}
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.c.query(sql, params);
    return rows as T[];
  }
  async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }
  async run(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
    const [res] = await this.c.query(sql, params);
    return res as ResultSetHeader;
  }
}

@Injectable()
export class Db implements Q, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Db');
  private pool!: Pool;
  private q!: ConnQ;

  async onModuleInit() {
    this.pool = mysql.createPool({
      host: ENV.db.host,
      port: ENV.db.port,
      user: ENV.db.user,
      password: ENV.db.password,
      database: ENV.db.database,
      connectionLimit: ENV.db.connectionLimit,
      charset: 'utf8mb4_unicode_ci',
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: true,
      waitForConnections: true,
    });
    this.q = new ConnQ(this.pool);
    await migrate(this);
    this.log.log(`Connected to MySQL database "${ENV.db.database}"`);
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  all<T = any>(sql: string, params?: unknown[]) {
    return this.q.all<T>(sql, params);
  }
  one<T = any>(sql: string, params?: unknown[]) {
    return this.q.one<T>(sql, params);
  }
  run(sql: string, params?: unknown[]) {
    return this.q.run(sql, params);
  }

  /** Runs fn in one transaction; rolls back on any error. */
  async tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const out = await fn(new ConnQ(c));
      await c.commit();
      return out;
    } catch (e) {
      await c.rollback().catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }
}
