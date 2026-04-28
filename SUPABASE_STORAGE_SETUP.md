# Supabase Storage Setup — ATS Resume Files

## 1. Create the `resumes` bucket

Option A — SQL (run in Supabase Dashboard / SQL Editor):
```sql
-- Create the public bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;
```

Option B — Dashboard:
1. Go to **Storage** in your Supabase project
2. Click **New bucket**
3. Name: `resumes`
4. Toggle **Public bucket** ON (required for public URLs to work)
5. Save

---

## 2. Row-Level Security (RLS) Policies

### Enable RLS on the bucket
```sql
-- Enable RLS on the objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
```

### Allow public read (required for resume previews/downloads)
```sql
-- Policy: Allow anyone to SELECT (read) objects in the resumes bucket
CREATE POLICY "Allow public read on resumes"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes');
```

### Allow authenticated write (optional — for signed uploads from frontend)
```sql
-- Policy: Allow authenticated users to INSERT (upload)
CREATE POLICY "Allow authenticated uploads to resumes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'resumes' AND auth.role() = 'authenticated');

-- Policy: Allow authenticated users to DELETE their own files
CREATE POLICY "Allow authenticated delete on resumes"
ON storage.objects FOR DELETE
USING (bucket_id = 'resumes' AND auth.uid() = owner);
```

### Allow service-role write (for backend uploads with `service_role` key)
```sql
-- Policy: Allow service_role key to manage bucket
CREATE POLICY "Allow service role all on resumes"
ON storage.objects FOR ALL
USING (bucket_id = 'resumes')
WITH CHECK (bucket_id = 'resumes');
```

> **Note:** The backend uses the `anon` key from `config.py`. If the bucket is public and RLS is disabled or has a public-read policy, uploads from the backend will work. For production, switch to the **service_role** key and create a service-role policy.

---

## 3. Optional: Organize by user_id

If you want to organize as `resumes/{user_id}/{filename}`:

### Update the upload code
In `backend/api/upload.py`, change the object name:
```python
# In _save_uploaded_resume_file(...)
from backend.utils.auth import get_current_user
user_id = get_current_user() or "anonymous"
unique_name = f"{user_id}/{uuid.uuid4().hex}{ext}"
```

### Update the naming in the database
The `resume_file_path` already stores the full path. No DB schema change needed.

### Update policies with user isolation
```sql
-- Policy: Users can only read their own folder
CREATE POLICY "Allow users read own resumes"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can only upload to their own folder
CREATE POLICY "Allow users insert own resumes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 4. DB schema (no changes required)

The existing `resumes.resume_file_path` column already stores:
- Full Supabase Storage **public URL** (e.g. `https://.../storage/v1/object/public/resumes/abc123.pdf`)
- Or the **storage path** (`abc123.pdf`) which falls back to `/resume-file/abc123.pdf`

Both work seamlessly with the frontend `buildResumeFileUrl()` helper.

---

## 5. Verify setup

Run these tests after deploying:

| Test | Command / Action |
|------|------------------|
| Upload via match | POST `/api/upload` with `job_description` + `resumes` |
| Bulk upload | POST `/api/bulk-upload-resumes` with multiple files |
| Preview resume | Click **View Resume** in ATS match/search pages |
| Download resume | Use the **Download original file** link in preview modal |

---

## 6. Cleanup

After confirming uploads work via Supabase Storage:

```bash
# Remove old local files (optional)
cd backend/uploads/
rm -rf *
```

The `UPLOAD_FOLDER` and `uploads/` directory are no longer used by the refactored code, but kept in `config.py` for backward compatibility with legacy `parse_resumes_from_paths()`.
