"""Test script to verify local model loading."""
import os
import sys
import time

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 60)
print("TESTING LOCAL MODEL LOADING")
print("=" * 60)

# Test 1: Check if models directory exists
models_dir = os.path.join(os.path.dirname(__file__), "models")
print(f"\n1. Checking models directory: {models_dir}")
if os.path.exists(models_dir):
    print(f"   ✅ Models directory exists")
    
    # List contents
    contents = os.listdir(models_dir)
    print(f"   Contents: {contents}")
    
    if "all-MiniLM-L6-v2" in contents:
        print(f"   ✅ SentenceTransformer model found")
    else:
        print(f"   ⚠️  SentenceTransformer model not found - run download_models.py first")
else:
    print(f"   ❌ Models directory doesn't exist - run download_models.py first")

# Test 2: Load model from local path
print("\n2. Testing local model loading...")
try:
    from sentence_transformers import SentenceTransformer
    
    model_path = os.path.join(models_dir, "all-MiniLM-L6-v2")
    
    start_time = time.time()
    model = SentenceTransformer(model_path, local_files_only=True)
    load_time = time.time() - start_time
    
    print(f"   ✅ Model loaded successfully from: {model_path}")
    print(f"   ⏱️  Load time: {load_time:.2f} seconds")
    
    # Test encoding
    test_text = "Software engineer with Python experience"
    embedding = model.encode([test_text])
    print(f"   ✅ Encoding test successful (shape: {embedding.shape})")
    
except Exception as e:
    print(f"   ❌ Error loading model: {e}")
    import traceback
    traceback.print_exc()

# Test 3: Test config-based loading
print("\n3. Testing config-based model loading...")
try:
    from backend.config import SENTENCE_TRANSFORMER_MODEL
    
    print(f"   Config path: {SENTENCE_TRANSFORMER_MODEL}")
    
    start_time = time.time()
    model = SentenceTransformer(SENTENCE_TRANSFORMER_MODEL, local_files_only=True)
    load_time = time.time() - start_time
    
    print(f"   ✅ Model loaded from config path")
    print(f"   ⏱️  Load time: {load_time:.2f} seconds")
    
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 4: Test NLP pipeline
print("\n4. Testing NLP pipeline integration...")
try:
    from backend.services.nlp_pipeline import extract_resume_entities
    
    test_text = """
    Senior Software Engineer with 5 years of experience.
    Skills: Python, JavaScript, React, Node.js
    Location: Chennai, India
    Email: developer@example.com
    Phone: +91-9876543210
    """
    
    start_time = time.time()
    skills, exp, locations, phones, emails = extract_resume_entities(test_text)
    process_time = time.time() - start_time
    
    print(f"   ✅ NLP pipeline working")
    print(f"   ⏱️  Processing time: {process_time:.2f} seconds")
    print(f"   Extracted:")
    print(f"     - Skills: {len(skills)} found")
    print(f"     - Experience: {exp}")
    print(f"     - Locations: {len(locations)} found")
    print(f"     - Phones: {len(phones)} found")
    print(f"     - Emails: {len(emails)} found")
    
except Exception as e:
    print(f"   ❌ Error in NLP pipeline: {e}")
    import traceback
    traceback.print_exc()

# Test 5: Test matching service
print("\n5. Testing matching service integration...")
try:
    from backend.services.matching import match_resumes_to_jd
    
    jd = "Looking for a Python developer with machine learning experience"
    resumes = [
        "Machine learning engineer with Python and TensorFlow",
        "Frontend developer with React and JavaScript",
        "Backend developer with Python and Django"
    ]
    
    start_time = time.time()
    results = match_resumes_to_jd(jd, resumes)
    process_time = time.time() - start_time
    
    print(f"   ✅ Matching service working")
    print(f"   ⏱️  Matching time: {process_time:.2f} seconds")
    print(f"   Results:")
    for i, (resume, score) in enumerate(zip(resumes, results), 1):
        print(f"     {i}. Score: {score:.3f} - {resume[:50]}...")
    
except Exception as e:
    print(f"   ❌ Error in matching service: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
print("\nSummary:")
print("- If all tests passed ✅, local model loading is working correctly")
print("- If any tests failed ❌, run: python download_models.py")
print("\nExpected performance:")
print("- Model load time: < 5 seconds (from local)")
print("- NLP processing: < 2 seconds per resume")
print("- Matching: < 1 second per resume-JD pair")
