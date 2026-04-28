"""Supabase schema: initialize database connection."""


def get_db():
    """Return the Supabase client instance."""
    from backend.services.supabase_client import get_supabase_client
    return get_supabase_client()


def init_db():
    """Database tables are managed in Supabase. Local uploads dir is no longer needed."""
    print("Database initialized: Using Supabase PostgreSQL")
