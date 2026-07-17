import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = path.join(process.cwd(), "data", "track-images.sqlite");

export type TrackImageRow = {
  youtube_id: string;
  content_type: string;
  data: Buffer;
};

function openDb(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS track_images (
      youtube_id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      data BLOB NOT NULL,
      byte_size INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

/** Read track artwork from the local SQLite database. */
export function getTrackImageFromSqlite(
  youtubeId: string,
): TrackImageRow | null {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const db = openDb();
    const row = db
      .prepare(
        `SELECT youtube_id, content_type, data FROM track_images WHERE youtube_id = ?`,
      )
      .get(youtubeId) as
      | { youtube_id: string; content_type: string; data: Buffer }
      | undefined;
    db.close();
    if (!row?.data) return null;
    return {
      youtube_id: row.youtube_id,
      content_type: row.content_type,
      data: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data),
    };
  } catch {
    return null;
  }
}

/** Upsert track artwork into the local SQLite database. */
export function upsertTrackImageSqlite(
  youtubeId: string,
  buffer: Buffer,
  contentType: string,
): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO track_images (youtube_id, content_type, data, byte_size, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(youtube_id) DO UPDATE SET
       content_type = excluded.content_type,
       data = excluded.data,
       byte_size = excluded.byte_size,
       updated_at = excluded.updated_at`,
  ).run(
    youtubeId,
    contentType,
    buffer,
    buffer.length,
    new Date().toISOString(),
  );
  db.close();
}

export function sqliteDbPath(): string {
  return DB_PATH;
}
