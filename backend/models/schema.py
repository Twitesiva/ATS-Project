"""SQLite schema: create tables, Resume row mapping."""
import os
import sqlite3
from backend.config import DATABASE_PATH, UPLOAD_FOLDER


def get_db():
    """Return a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_db():
    """Migrate existing database to new schema if needed."""
    conn = get_db()
    cursor = conn.execute("PRAGMA table_info(resumes)")
    columns = {row["name"] for row in cursor.fetchall()}
    
    # Add email column if missing
    if "email" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN email TEXT")
            print("Migration: Added email column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (email): {e}")
    
    # Add phone_number column if missing (and migrate from phone_numbers if exists)
    if "phone_number" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN phone_number TEXT")
            print("Migration: Added phone_number column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (phone_number): {e}")
    
    # SEMANTIC ROLE MATCHING – NON-BREAKING: Add role intent columns
    if "role_label" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN role_label TEXT")
            print("Migration: Added role_label column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (role_label): {e}")
    
    if "role_type" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN role_type TEXT")
            print("Migration: Added role_type column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (role_type): {e}")
    
    if "role_family" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN role_family TEXT")
            print("Migration: Added role_family column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (role_family): {e}")
    
    if "primary_skill" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN primary_skill TEXT")
            print("Migration: Added primary_skill column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (primary_skill): {e}")
    
    if "role_embedding" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN role_embedding BLOB")
            print("Migration: Added role_embedding column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (role_embedding): {e}")
    
    if "skill_embedding" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN skill_embedding BLOB")
            print("Migration: Added skill_embedding column")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (skill_embedding): {e}")
    
    # Drop old phone_numbers column if it exists (data migration not needed, will be repopulated)
    if "phone_numbers" in columns:
        try:
            # SQLite doesn't support DROP COLUMN directly, need to recreate table
            # For now, just ignore the old column
            print("Migration: Old phone_numbers column exists (will be ignored)")
        except Exception as e:
            print(f"Migration warning (phone_numbers): {e}")
    
    # Add is_matched column if missing
    if "is_matched" not in columns:
        try:
            conn.execute("ALTER TABLE resumes ADD COLUMN is_matched BOOLEAN DEFAULT TRUE")
            print("Migration: Added is_matched column (defaults to TRUE for existing records)")
        except sqlite3.OperationalError as e:
            print(f"Migration warning (is_matched): {e}")
    
    # Create indexes
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_email ON resumes(email)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_phone ON resumes(phone_number)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_role_label ON resumes(role_label)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_is_matched ON resumes(is_matched)")
    except sqlite3.OperationalError as e:
        print(f"Migration warning (indexes): {e}")
    
    conn.commit()
    conn.close()


def init_db():
    """Create uploads dir and resumes table if they do not exist."""
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    conn = get_db()
    
    # Check if table exists
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='resumes'")
    table_exists = cursor.fetchone() is not None
    
    if not table_exists:
        # Create new table with full schema
        conn.execute(
            """
            CREATE TABLE resumes (
                resume_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                phone_number TEXT,
                extracted_skills TEXT NOT NULL,
                experience_years REAL,
                locations TEXT NOT NULL,
                match_percentage REAL,
                resume_file_path TEXT NOT NULL,
                uploaded_date TEXT NOT NULL,
                raw_text TEXT
            )
            """
        )
    
    conn.commit()
    conn.close()
    
    # Run migrations for existing databases (adds missing columns)
    _migrate_db()
    
    # Create indexes (safe to run multiple times)
    conn = get_db()
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_locations ON resumes(locations)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_experience ON resumes(experience_years)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_match ON resumes(match_percentage)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_email ON resumes(email)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_phone ON resumes(phone_number)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_role_label ON resumes(role_label)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_role_type ON resumes(role_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_role_family ON resumes(role_family)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_primary_skill ON resumes(primary_skill)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resumes_is_matched ON resumes(is_matched)")
    conn.commit()
    conn.close()
