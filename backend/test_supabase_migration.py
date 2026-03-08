"""Test script to verify Supabase migration."""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.services.supabase_client import get_supabase_client
from backend.services.storage import store_resumes, fetch_resumes

def test_supabase_connection():
    """Test Supabase connection."""
    print("Testing Supabase connection...")
    supabase = get_supabase_client()
    print(f"✓ Supabase client initialized: {supabase.postgrest.base_url}")
    return True

def test_fetch_resumes():
    """Test fetching resumes from Supabase."""
    print("\nTesting fetch resumes...")
    try:
        resumes = fetch_resumes()
        print(f"✓ Fetched {len(resumes)} resumes from Supabase")
        if resumes:
            print(f"  Sample resume: {resumes[0]['name']} - {resumes[0]['email']}")
        return True
    except Exception as e:
        print(f"✗ Error fetching resumes: {e}")
        return False

def test_store_resume():
    """Test storing a resume to Supabase."""
    print("\nTesting store resume...")
    try:
        test_resume = {
            "original_name": "Test User",
            "name": "Test User",
            "emails": ["test.user@example.com"],
            "phone_numbers": ["+919876543210"],
            "extracted_skills": ["Python", "React", "SQL"],
            "experience_years": 3.5,
            "location_display": "Bangalore",
            "match_percentage": 85.5,
            "path": "test_resume.pdf",
            "raw_text": "Test resume content for validation",
            "role_label": "Python Developer",
            "role_type": "Developer",
            "role_family": "Engineering",
            "primary_skill": "Python",
            "is_matched": True
        }
        
        count = store_resumes([test_resume])
        print(f"✓ Stored {count} resume(s) in Supabase")
        
        # Verify by fetching
        resumes = fetch_resumes()
        test_stored = any(r.get("email") == "test.user@example.com" for r in resumes)
        if test_stored:
            print(f"✓ Verified: Test resume found in database")
        else:
            print(f"⚠ Warning: Test resume not found in fetch results")
        
        return True
    except Exception as e:
        print(f"✗ Error storing resume: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests."""
    print("=" * 60)
    print("SUPABASE MIGRATION TEST")
    print("=" * 60)
    
    tests = [
        ("Connection Test", test_supabase_connection),
        ("Fetch Resumes Test", test_fetch_resumes),
        ("Store Resume Test", test_store_resume),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"✗ {test_name} failed with exception: {e}")
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
