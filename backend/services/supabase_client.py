"""Supabase client for database operations."""
import os
from supabase import create_client, Client

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://vnojbpuphsvzrvmjxoei.supabase.co")

# Prefer service role on the backend so reads/writes aren't blocked by RLS.
# Falls back to anon key for local/dev if service role isn't provided.
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZub2picHVwaHN2enJ2bWp4b2VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTc1NDMsImV4cCI6MjA4NzM5MzU0M30.ah660DfGEpsa6XBcyjVDc7snPk8lqvadUZjgTtizbSQ"
)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_supabase_client(jwt_token: str | None = None) -> Client:
    """
    Return a Supabase client.

    - Default: backend key (service-role preferred) client.
    - If jwt_token provided: create a per-request client that executes as that user
      (role=authenticated) so RLS policies using auth.uid() work.
    """
    if not jwt_token:
        return supabase

    return create_client(
        SUPABASE_URL,
        # Use anon key when executing as a user; their JWT drives auth.uid() via header.
        os.getenv("SUPABASE_ANON_KEY") or SUPABASE_KEY,
        options={"headers": {"Authorization": f"Bearer {jwt_token}"}},
    )
