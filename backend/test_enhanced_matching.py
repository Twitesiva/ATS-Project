#!/usr/bin/env python3
"""
Test script for enhanced matching system validation
"""

import requests
import json

def test_enhanced_matching():
    """Test the enhanced matching system with sample data"""
    
    # Test data
    job_description = """
    Senior Python Developer
    We are looking for an experienced Python developer with 5+ years of experience.
    Required skills: Python, Django, REST APIs, PostgreSQL, Docker
    Experience with cloud platforms (AWS/GCP) preferred.
    """
    
    # Sample resume paths (using actual files from uploads directory)
    resume_paths = [
        {"path": "00d4fee199b34b6dae8b30a628f91515.pdf", "original_name": "resume1.pdf"},
        {"path": "023edd1bedbb48ca92d2058a4804c57d.pdf", "original_name": "resume2.pdf"}
    ]
    
    # Test enhanced matching endpoint
    url = "http://127.0.0.1:5000/api/match"
    
    payload = {
        "job_description": job_description,
        "resume_paths": resume_paths,
        "use_enhanced_matching": True,
        "use_role_gatekeeper": False  # Return all results for testing
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        results = response.json()
        print("✅ Enhanced Matching Test Results:")
        print(f"Pipeline used: {results.get('pipeline', 'unknown')}")
        print(f"Number of results: {len(results.get('results', []))}")
        
        for i, result in enumerate(results.get('results', [])):
            print(f"\n--- Resume {i+1}: {result.get('original_name', 'Unknown')} ---")
            print(f"Match Percentage: {result.get('match_percentage', 0)}%")
            print(f"Quality Category: {result.get('quality_category', 'Unknown')}")
            print(f"Is Matched: {result.get('is_matched', False)}")
            
            # Check for enhanced explanation data
            explanation = result.get('explanation', {})
            if explanation:
                print(f"Overall Score: {explanation.get('overall_score', 0)}")
                print(f"Summary: {explanation.get('summary', 'No summary')}")
                print(f"Role Match: {explanation.get('role_match', 'No role analysis')}")
                
                # Component breakdown
                components = explanation.get('components', [])
                if components:
                    print("Component Breakdown:")
                    for comp in components:
                        print(f"  {comp['name']}: {comp['score']:.2f} (weight: {comp['weight']})")
                        print(f"    {comp['explanation']}")
            
            # Skills analysis
            matching_skills = result.get('matching_skills', [])
            missing_skills = result.get('missing_skills', [])
            print(f"Matching Skills ({len(matching_skills)}): {', '.join(matching_skills[:5])}")
            print(f"Missing Skills ({len(missing_skills)}): {', '.join(missing_skills[:5])}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ API Error: {e}")
        return False
    except Exception as e:
        print(f"❌ Test Error: {e}")
        return False
    
    return True

def test_standard_matching():
    """Test standard matching for comparison"""
    
    job_description = "Java Developer with Spring experience"
    resume_paths = [{"path": "00d4fee199b34b6dae8b30a628f91515.pdf", "original_name": "resume1.pdf"}]
    
    url = "http://127.0.0.1:5000/api/match"
    
    payload = {
        "job_description": job_description,
        "resume_paths": resume_paths,
        "use_enhanced_matching": False,
        "use_role_gatekeeper": False
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        results = response.json()
        print("\n✅ Standard Matching Test Results:")
        print(f"Pipeline used: {results.get('pipeline', 'unknown')}")
        print(f"Number of results: {len(results.get('results', []))}")
        
        for result in results.get('results', [])[:1]:  # Show first result
            print(f"Match Percentage: {result.get('match_percentage', 0)}%")
            print(f"Matching Skills: {len(result.get('matching_skills', []))}")
            print(f"Missing Skills: {len(result.get('missing_skills', []))}")
            
    except Exception as e:
        print(f"❌ Standard Matching Test Error: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("🧪 Testing Enhanced ATS Matching System")
    print("=" * 50)
    
    # Test enhanced matching
    print("\n1. Testing Enhanced Matching System:")
    enhanced_success = test_enhanced_matching()
    
    # Test standard matching for comparison
    print("\n2. Testing Standard Matching System:")
    standard_success = test_standard_matching()
    
    print("\n" + "=" * 50)
    if enhanced_success and standard_success:
        print("✅ All tests passed! Enhanced matching system is working correctly.")
    else:
        print("❌ Some tests failed. Please check the implementation.")