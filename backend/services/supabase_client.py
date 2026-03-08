"""Supabase client for database operations."""
import os
from supabase import create_client, Client

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://vnojbpuphsvzrvmjxoei.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZub2picHVwaHN2enJ2bWp4b2VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTc1NDMsImV4cCI6MjA4NzM5MzU0M30.ah660DfGEpsa6XBcyjVDc7snPk8lqvadUZjgTtizbSQ")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_supabase_client():
    """Return the Supabase client instance."""
    return supabase
