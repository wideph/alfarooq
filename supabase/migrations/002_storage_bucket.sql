-- Create private storage bucket named "uploads" in Supabase Dashboard first,
-- then run this SQL in Supabase SQL Editor.

-- Bucket should be PRIVATE (not public). Files are served via server API only.

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Deny public access; server uses service role key
CREATE POLICY "Service role full access uploads"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'uploads')
WITH CHECK (bucket_id = 'uploads');
