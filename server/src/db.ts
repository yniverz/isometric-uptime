import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import type { EventDTO, Status } from '../../shared/status.js';

const DB_FILE = path.join(config.dataDir, 'rackscape.db');
// Installations from before the rename used a different file name.
const LEGACY_DB_FILE = path.join(config.dataDir, 'isometric-uptime.db');
if (!fs.existsSync(DB_FILE) && fs.existsSync(LEGACY_DB_FILE)) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(LEGACY_DB_FILE + suffix)) fs.renameSync(LEGACY_DB_FILE + suffix, DB_FILE + suffix);
  }
  console.log('[boot] migrated isometric-uptime.db → rackscape.db');
}

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS world (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS world_history (
    version INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    time INTEGER NOT NULL,
    msg TEXT NOT NULL DEFAULT '',
    UNIQUE (monitor_id, time)
  );
  CREATE INDEX IF NOT EXISTS events_time ON events (time DESC);
  CREATE INDEX IF NOT EXISTS events_monitor ON events (monitor_id, time DESC);
`);

const HISTORY_KEEP = 50;

export function loadWorld(): { version: number; data: unknown } | null {
  const row = db.prepare('SELECT version, data FROM world WHERE id = 1').get() as { version: number; data: string } | undefined;
  if (!row) return null;
  return { version: row.version, data: JSON.parse(row.data) };
}

export function saveWorld(data: unknown, version: number): void {
  const json = JSON.stringify(data);
  const now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO world (id, version, data, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data, updated_at = excluded.updated_at`,
    ).run(version, json, now);
    db.prepare('INSERT OR REPLACE INTO world_history (version, data, updated_at) VALUES (?, ?, ?)').run(version, json, now);
    db.prepare('DELETE FROM world_history WHERE version <= ?').run(version - HISTORY_KEEP);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function listWorldHistory(): { version: number; updatedAt: number; size: number }[] {
  return (
    db.prepare('SELECT version, updated_at, length(data) AS size FROM world_history ORDER BY version DESC').all() as {
      version: number;
      updated_at: number;
      size: number;
    }[]
  ).map((r) => ({ version: r.version, updatedAt: r.updated_at, size: r.size }));
}

export function getWorldHistory(version: number): unknown | null {
  const row = db.prepare('SELECT data FROM world_history WHERE version = ?').get(version) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

const insertEvent = db.prepare('INSERT OR IGNORE INTO events (monitor_id, status, time, msg) VALUES (?, ?, ?, ?)');

export function recordEvent(monitorId: number, status: Status, time: number, msg: string): boolean {
  const res = insertEvent.run(monitorId, status, time, msg ?? '');
  return Number(res.changes) > 0;
}

export function queryEvents(opts: { monitorIds?: number[]; limit?: number; before?: number }): EventDTO[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const params: (number | string)[] = [];
  let where = '1=1';
  if (opts.monitorIds && opts.monitorIds.length) {
    where += ` AND monitor_id IN (${opts.monitorIds.map(() => '?').join(',')})`;
    params.push(...opts.monitorIds);
  }
  if (opts.before) {
    where += ' AND time < ?';
    params.push(opts.before);
  }
  params.push(limit);
  const rows = db
    .prepare(`SELECT id, monitor_id, status, time, msg FROM events WHERE ${where} ORDER BY time DESC LIMIT ?`)
    .all(...params) as { id: number; monitor_id: number; status: Status; time: number; msg: string }[];
  return rows.map((r) => ({ id: r.id, monitorId: r.monitor_id, status: r.status, time: r.time, msg: r.msg }));
}

/** Keep the event table bounded. */
export function pruneEvents(maxAgeDays = 90): void {
  db.prepare('DELETE FROM events WHERE time < ?').run(Date.now() - maxAgeDays * 86400_000);
}
