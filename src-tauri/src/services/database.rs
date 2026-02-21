//! SQLite database service for library management

use crate::error::{ClipyError, Result};
use crate::models::library::LibraryVideo;
use crate::utils::paths;
use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::AppHandle;
use tracing::{debug, info};

/// Global database connection
static DATABASE: Mutex<Option<Connection>> = Mutex::new(None);

/// Initialize the database
pub fn init_database(app: &AppHandle) -> Result<()> {
    info!("Initializing database");

    let db_path = paths::get_database_path(app)?;
    debug!("Database path: {:?}", db_path);

    let conn = Connection::open(&db_path)
        .map_err(|e| ClipyError::Other(format!("Failed to open database: {}", e)))?;

    // Create tables
    create_tables(&conn)?;

    let mut db = DATABASE.lock().map_err(|_| ClipyError::Other("Database lock poisoned".into()))?;
    *db = Some(conn);

    info!("Database initialized successfully");
    Ok(())
}

/// Create database tables
fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS library_videos (
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
        )",
        [],
    ).map_err(|e| ClipyError::Other(format!("Failed to create library_videos table: {}", e)))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            modified_at TEXT NOT NULL
        )",
        [],
    ).map_err(|e| ClipyError::Other(format!("Failed to create projects table: {}", e)))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS download_history (
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
        )",
        [],
    ).map_err(|e| ClipyError::Other(format!("Failed to create download_history table: {}", e)))?;

    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_video_id ON library_videos(video_id)",
        [],
    ).ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_downloaded_at ON library_videos(downloaded_at)",
        [],
    ).ok();

    debug!("Database tables created");
    Ok(())
}

/// Add a video to the library
pub fn add_library_video(video: &LibraryVideo) -> Result<()> {
    let db = DATABASE.lock().map_err(|_| ClipyError::Other("Database lock poisoned".into()))?;
    let conn = db.as_ref().ok_or_else(|| ClipyError::Other("Database not initialized".into()))?;

    conn.execute(
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
    ).map_err(|e| ClipyError::Other(format!("Failed to insert video: {}", e)))?;

    debug!("Added video to library: {}", video.title);
    Ok(())
}

/// Get all videos from the library
pub fn get_library_videos() -> Result<Vec<LibraryVideo>> {
    let db = DATABASE.lock().map_err(|_| ClipyError::Other("Database lock poisoned".into()))?;
    let conn = db.as_ref().ok_or_else(|| ClipyError::Other("Database not initialized".into()))?;

    let mut stmt = conn.prepare(
        "SELECT id, video_id, title, thumbnail, duration, channel, file_path, file_size, format, resolution, downloaded_at, source_url
         FROM library_videos ORDER BY downloaded_at DESC"
    ).map_err(|e| ClipyError::Other(format!("Failed to prepare query: {}", e)))?;

    let videos = stmt.query_map([], |row| {
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
    }).map_err(|e| ClipyError::Other(format!("Failed to query videos: {}", e)))?;

    let mut result = Vec::new();
    for video in videos {
        result.push(video.map_err(|e| ClipyError::Other(format!("Failed to read video: {}", e)))?);
    }

    Ok(result)
}

/// Delete a video from the library
pub fn delete_library_video(id: &str) -> Result<()> {
    let db = DATABASE.lock().map_err(|_| ClipyError::Other("Database lock poisoned".into()))?;
    let conn = db.as_ref().ok_or_else(|| ClipyError::Other("Database not initialized".into()))?;

    conn.execute("DELETE FROM library_videos WHERE id = ?1", params![id])
        .map_err(|e| ClipyError::Other(format!("Failed to delete video: {}", e)))?;

    debug!("Deleted video from library: {}", id);
    Ok(())
}

/// Search videos in the library
pub fn search_library_videos(query: &str) -> Result<Vec<LibraryVideo>> {
    let db = DATABASE.lock().map_err(|_| ClipyError::Other("Database lock poisoned".into()))?;
    let conn = db.as_ref().ok_or_else(|| ClipyError::Other("Database not initialized".into()))?;

    let search_pattern = format!("%{}%", query);

    let mut stmt = conn.prepare(
        "SELECT id, video_id, title, thumbnail, duration, channel, file_path, file_size, format, resolution, downloaded_at, source_url
         FROM library_videos
         WHERE title LIKE ?1 OR channel LIKE ?1
         ORDER BY downloaded_at DESC"
    ).map_err(|e| ClipyError::Other(format!("Failed to prepare query: {}", e)))?;

    let videos = stmt.query_map(params![search_pattern], |row| {
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
    }).map_err(|e| ClipyError::Other(format!("Failed to query videos: {}", e)))?;

    let mut result = Vec::new();
    for video in videos {
        result.push(video.map_err(|e| ClipyError::Other(format!("Failed to read video: {}", e)))?);
    }

    Ok(result)
}
