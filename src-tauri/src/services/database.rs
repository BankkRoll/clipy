//! SQLite database service for library management
//!
//! Responsibilities:
//! - [`Database`]: an injectable wrapper around one SQLite [`Connection`]
//!   (file-backed in the app, `open_in_memory` in tests).
//! - Schema migrations keyed on `PRAGMA user_version`.
//! - Library CRUD + search with literal-safe `LIKE` matching.
//! - Process-wide accessors (`init_database`, `add_library_video`, ...) kept as
//!   thin wrappers so existing command call sites stay unchanged.

use crate::error::{ClipyError, Result};
use crate::models::library::LibraryVideo;
use crate::utils::paths;
use rusqlite::{params, Connection, Row};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard, RwLock};
use tauri::{AppHandle, Runtime};
use tracing::{debug, info, warn};

/// Ordered schema migrations. Entry `i` upgrades `user_version` from `i` to
/// `i + 1`; append new entries, never edit shipped ones.
///
/// NOTE: v1 uses `IF NOT EXISTS` because databases created before migrations
/// existed already contain these tables at `user_version = 0`.
/// `projects` and `download_history` are currently unused but kept so existing
/// user databases and future migrations share one baseline.
const MIGRATIONS: &[&str] = &["
    CREATE TABLE IF NOT EXISTS library_videos (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        thumbnail TEXT,
        duration INTEGER NOT NULL,
        channel TEXT,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        format TEXT NOT NULL,
        resolution TEXT NOT NULL,
        downloaded_at TEXT NOT NULL,
        source_url TEXT NOT NULL,
        UNIQUE(video_id, file_path)
    );
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        modified_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS download_history (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        quality TEXT NOT NULL,
        format TEXT NOT NULL,
        output_path TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_library_video_id ON library_videos(video_id);
    CREATE INDEX IF NOT EXISTS idx_library_downloaded_at ON library_videos(downloaded_at);
"];

const SELECT_COLUMNS: &str =
    "SELECT id, video_id, title, thumbnail, duration, channel, file_path, \
     file_size, format, resolution, downloaded_at, source_url FROM library_videos";

/// Aggregate numbers about the library.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    /// Number of videos in the library.
    pub video_count: u64,
    /// Sum of `file_size` across all videos, in bytes.
    pub total_size: u64,
}

/// A migrated SQLite connection holding the video library.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Open (creating if needed) the database file at `path` and migrate it.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)
            .map_err(|e| ClipyError::Other(format!("Failed to open database: {}", e)))?;
        Self::from_connection(conn)
    }

    /// Open a private in-memory database (used by tests).
    pub fn open_in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    /// Wrap an existing connection, applying any pending migrations.
    pub fn from_connection(mut conn: Connection) -> Result<Self> {
        migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn conn(&self) -> Result<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| ClipyError::Other("Database lock poisoned".into()))
    }

    /// Current `PRAGMA user_version`.
    pub fn schema_version(&self) -> Result<u32> {
        let conn = self.conn()?;
        Ok(user_version(&conn)?)
    }

    /// Insert a video, replacing any row with the same `id` or the same
    /// `(video_id, file_path)` pair.
    pub fn add_library_video(&self, video: &LibraryVideo) -> Result<()> {
        self.conn()?
            .execute(
                "INSERT OR REPLACE INTO library_videos
                 (id, video_id, title, thumbnail, duration, channel, file_path, file_size, format, resolution, downloaded_at, source_url)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    video.id,
                    video.video_id,
                    video.title,
                    video.thumbnail,
                    video.duration,
                    video.channel,
                    video.file_path,
                    video.file_size,
                    video.format,
                    video.resolution,
                    video.downloaded_at,
                    video.source_url,
                ],
            )
            .map_err(|e| ClipyError::Other(format!("Failed to insert video: {}", e)))?;
        debug!("Added video to library: {}", video.title);
        Ok(())
    }

    /// All videos, newest first.
    pub fn get_library_videos(&self) -> Result<Vec<LibraryVideo>> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(&format!("{SELECT_COLUMNS} ORDER BY downloaded_at DESC"))
            .map_err(|e| ClipyError::Other(format!("Failed to prepare query: {}", e)))?;
        let rows = stmt
            .query_map([], row_to_video)
            .map_err(|e| ClipyError::Other(format!("Failed to query videos: {}", e)))?;
        collect_rows(rows)
    }

    /// Delete the video with `id`. Deleting a missing id is not an error.
    pub fn delete_library_video(&self, id: &str) -> Result<()> {
        self.conn()?
            .execute("DELETE FROM library_videos WHERE id = ?1", params![id])
            .map_err(|e| ClipyError::Other(format!("Failed to delete video: {}", e)))?;
        debug!("Deleted video from library: {}", id);
        Ok(())
    }

    /// Case-insensitive substring search over title and channel, newest first.
    ///
    /// `%` and `_` in `query` match literally rather than acting as wildcards.
    pub fn search_library_videos(&self, query: &str) -> Result<Vec<LibraryVideo>> {
        let pattern = format!("%{}%", escape_like(query));
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(&format!(
                "{SELECT_COLUMNS}
                 WHERE title LIKE ?1 ESCAPE '\\' OR channel LIKE ?1 ESCAPE '\\'
                 ORDER BY downloaded_at DESC"
            ))
            .map_err(|e| ClipyError::Other(format!("Failed to prepare query: {}", e)))?;
        let rows = stmt
            .query_map(params![pattern], row_to_video)
            .map_err(|e| ClipyError::Other(format!("Failed to query videos: {}", e)))?;
        collect_rows(rows)
    }

    /// Video count and total size.
    pub fn library_stats(&self) -> Result<LibraryStats> {
        let conn = self.conn()?;
        let (count, size): (i64, i64) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(file_size), 0) FROM library_videos",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok(LibraryStats {
            video_count: count.max(0) as u64,
            total_size: size.max(0) as u64,
        })
    }
}

fn row_to_video(row: &Row<'_>) -> rusqlite::Result<LibraryVideo> {
    Ok(LibraryVideo {
        id: row.get(0)?,
        video_id: row.get(1)?,
        title: row.get(2)?,
        thumbnail: row.get(3)?,
        duration: row.get(4)?,
        channel: row.get(5)?,
        file_path: row.get(6)?,
        file_size: row.get(7)?,
        format: row.get(8)?,
        resolution: row.get(9)?,
        downloaded_at: row.get(10)?,
        source_url: row.get(11)?,
    })
}

fn collect_rows(
    rows: impl Iterator<Item = rusqlite::Result<LibraryVideo>>,
) -> Result<Vec<LibraryVideo>> {
    rows.map(|r| r.map_err(|e| ClipyError::Other(format!("Failed to read video: {}", e))))
        .collect()
}

/// Escape `\`, `%` and `_` so `s` matches literally inside a `LIKE ... ESCAPE '\'`.
///
/// # Example
/// ```
/// use clipy_lib::services::database::escape_like;
/// assert_eq!(escape_like("100%_off"), "100\\%\\_off");
/// ```
pub fn escape_like(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

fn user_version(conn: &Connection) -> rusqlite::Result<u32> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

/// Apply every migration newer than the connection's `user_version`, each in
/// its own transaction so a failure leaves the schema at the last good version.
fn migrate(conn: &mut Connection) -> Result<()> {
    let current = user_version(conn)? as usize;
    if current > MIGRATIONS.len() {
        warn!(
            "Database schema v{} is newer than this build (v{}); continuing without migrating",
            current,
            MIGRATIONS.len()
        );
        return Ok(());
    }
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let version = index + 1;
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version as u32)?;
        tx.commit()?;
        info!("Database migrated to schema v{}", version);
    }
    Ok(())
}

static DATABASE: RwLock<Option<Arc<Database>>> = RwLock::new(None);

/// Open the app's library database and install it as the process-wide instance.
pub fn init_database<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    info!("Initializing database");
    let db_path = paths::get_database_path(app)?;
    debug!("Database path: {:?}", db_path);
    install(Arc::new(Database::open(&db_path)?));
    info!("Database initialized successfully");
    Ok(())
}

/// Replace the process-wide database instance.
pub fn install(db: Arc<Database>) {
    let mut slot = DATABASE.write().unwrap_or_else(|e| e.into_inner());
    *slot = Some(db);
}

/// The process-wide database, or an error before [`init_database`] ran.
pub fn global() -> Result<Arc<Database>> {
    DATABASE
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| ClipyError::Other("Database not initialized".into()))
}

/// Add a video to the global library. See [`Database::add_library_video`].
pub fn add_library_video(video: &LibraryVideo) -> Result<()> {
    global()?.add_library_video(video)
}

/// All videos in the global library. See [`Database::get_library_videos`].
pub fn get_library_videos() -> Result<Vec<LibraryVideo>> {
    global()?.get_library_videos()
}

/// Delete from the global library. See [`Database::delete_library_video`].
pub fn delete_library_video(id: &str) -> Result<()> {
    global()?.delete_library_video(id)
}

/// Search the global library. See [`Database::search_library_videos`].
pub fn search_library_videos(query: &str) -> Result<Vec<LibraryVideo>> {
    global()?.search_library_videos(query)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn video(id: &str, video_id: &str, title: &str, channel: &str, at: &str) -> LibraryVideo {
        LibraryVideo {
            id: id.into(),
            video_id: video_id.into(),
            title: title.into(),
            thumbnail: "thumb.jpg".into(),
            duration: 42,
            channel: channel.into(),
            file_path: format!("/videos/{id}.mp4"),
            file_size: 1000,
            format: "mp4".into(),
            resolution: "1080p".into(),
            downloaded_at: at.into(),
            source_url: format!("https://youtu.be/{video_id}"),
        }
    }

    fn ids(videos: &[LibraryVideo]) -> Vec<&str> {
        videos.iter().map(|v| v.id.as_str()).collect()
    }

    #[test]
    fn fresh_database_is_migrated_to_latest() {
        let db = Database::open_in_memory().unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len() as u32);
    }

    #[test]
    fn migrations_are_idempotent_and_upgrade_legacy_v0_databases() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("library.db");
        {
            // A pre-migration database: tables exist, user_version is 0.
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATIONS[0]).unwrap();
            assert_eq!(user_version(&conn).unwrap(), 0);
        }
        let db = Database::open(&path).unwrap();
        db.add_library_video(&video("a", "v", "t", "c", "2024-01-01"))
            .unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        assert_eq!(db.schema_version().unwrap(), 1);
        assert_eq!(db.get_library_videos().unwrap().len(), 1);
    }

    #[test]
    fn newer_schema_is_left_untouched() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 99u32).unwrap();
        let db = Database::from_connection(conn).unwrap();
        assert_eq!(db.schema_version().unwrap(), 99);
    }

    #[test]
    fn open_reports_unopenable_path() {
        let tmp = tempfile::tempdir().unwrap();
        let err = Database::open(&tmp.path().join("missing").join("x.db"))
            .err()
            .unwrap();
        assert!(err.to_string().contains("Failed to open database"));
    }

    #[test]
    fn crud_roundtrip_orders_newest_first() {
        let db = Database::open_in_memory().unwrap();
        let older = video("a", "v1", "First", "Chan", "2024-01-01T00:00:00Z");
        let newer = video("b", "v2", "Second", "Chan", "2024-06-01T00:00:00Z");
        db.add_library_video(&older).unwrap();
        db.add_library_video(&newer).unwrap();

        let all = db.get_library_videos().unwrap();
        assert_eq!(ids(&all), ["b", "a"]);
        assert_eq!(all[1].title, "First");
        assert_eq!(all[1].duration, 42);
        assert_eq!(all[1].source_url, "https://youtu.be/v1");

        db.delete_library_video("a").unwrap();
        db.delete_library_video("does-not-exist").unwrap();
        assert_eq!(ids(&db.get_library_videos().unwrap()), ["b"]);
    }

    #[test]
    fn same_video_and_path_replaces_previous_row() {
        let db = Database::open_in_memory().unwrap();
        let first = video("a", "v", "Old title", "C", "2024-01-01");
        let mut second = video("b", "v", "New title", "C", "2024-01-02");
        second.file_path = first.file_path.clone();
        db.add_library_video(&first).unwrap();
        db.add_library_video(&second).unwrap();

        let all = db.get_library_videos().unwrap();
        assert_eq!(ids(&all), ["b"]);
        assert_eq!(all[0].title, "New title");

        let mut renamed = all[0].clone();
        renamed.title = "Renamed".into();
        db.add_library_video(&renamed).unwrap();
        assert_eq!(db.get_library_videos().unwrap()[0].title, "Renamed");
    }

    #[test]
    fn search_matches_title_or_channel_case_insensitively() {
        let db = Database::open_in_memory().unwrap();
        db.add_library_video(&video("a", "1", "Rust Tutorial", "Ferris", "1"))
            .unwrap();
        db.add_library_video(&video("b", "2", "Cooking", "Rustacean TV", "2"))
            .unwrap();
        db.add_library_video(&video("c", "3", "Music", "Other", "3"))
            .unwrap();

        assert_eq!(ids(&db.search_library_videos("rust").unwrap()), ["b", "a"]);
        assert_eq!(ids(&db.search_library_videos("MUSIC").unwrap()), ["c"]);
        assert!(db.search_library_videos("nothing").unwrap().is_empty());
        assert_eq!(db.search_library_videos("").unwrap().len(), 3);
    }

    #[test]
    fn search_treats_wildcards_literally() {
        let db = Database::open_in_memory().unwrap();
        db.add_library_video(&video("pct", "1", "100% real", "c", "1"))
            .unwrap();
        db.add_library_video(&video("plain", "2", "1000 real", "c", "2"))
            .unwrap();
        db.add_library_video(&video("under", "3", "snake_case", "c", "3"))
            .unwrap();
        db.add_library_video(&video("nounder", "4", "snakeXcase", "c", "4"))
            .unwrap();
        db.add_library_video(&video("slash", "5", "a\\b", "c", "5"))
            .unwrap();

        assert_eq!(ids(&db.search_library_videos("100%").unwrap()), ["pct"]);
        assert_eq!(ids(&db.search_library_videos("%").unwrap()), ["pct"]);
        assert_eq!(
            ids(&db.search_library_videos("snake_case").unwrap()),
            ["under"]
        );
        assert_eq!(ids(&db.search_library_videos("_").unwrap()), ["under"]);
        assert_eq!(ids(&db.search_library_videos("a\\b").unwrap()), ["slash"]);
    }

    #[test]
    fn escape_like_escapes_only_special_chars() {
        assert_eq!(escape_like("plain"), "plain");
        assert_eq!(escape_like("a%b_c\\d"), "a\\%b\\_c\\\\d");
    }

    #[test]
    fn stats_count_and_sum_sizes() {
        let db = Database::open_in_memory().unwrap();
        assert_eq!(
            db.library_stats().unwrap(),
            LibraryStats {
                video_count: 0,
                total_size: 0
            }
        );
        db.add_library_video(&video("a", "1", "t", "c", "1"))
            .unwrap();
        let mut big = video("b", "2", "t", "c", "2");
        big.file_size = 5_000_000_000;
        db.add_library_video(&big).unwrap();
        assert_eq!(
            db.library_stats().unwrap(),
            LibraryStats {
                video_count: 2,
                total_size: 5_000_001_000
            }
        );
    }

    #[test]
    fn global_wrappers_delegate_to_installed_instance() {
        let _guard = crate::test_support::lock_globals();
        install(Arc::new(Database::open_in_memory().unwrap()));
        add_library_video(&video("g", "1", "Global", "c", "1")).unwrap();
        assert_eq!(ids(&get_library_videos().unwrap()), ["g"]);
        assert_eq!(ids(&search_library_videos("glob").unwrap()), ["g"]);
        delete_library_video("g").unwrap();
        assert!(get_library_videos().unwrap().is_empty());
        assert!(global().is_ok());
    }

    #[test]
    fn init_database_creates_file_under_app_data_dir() {
        let _guard = crate::test_support::lock_globals();
        let app = crate::test_support::mock_app_in_tempdir();
        init_database(app.handle()).unwrap();
        let path = paths::get_database_path(app.handle()).unwrap();
        assert!(path.exists());
        assert_eq!(global().unwrap().schema_version().unwrap(), 1);
    }
}
