"""Supabase schema: initialize database connection."""
import os
from backend.config import UPLOAD_FOLDER


def get_db():
    """Return the Supabase client instance."""
    from backend.services.supabase_client import get_supabase_client
    return get_supabase_client()


def init_db():
    """Create uploads dir. Database tables are managed in Supabase."""
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    print("Database initialized: Using Supabase PostgreSQL")
