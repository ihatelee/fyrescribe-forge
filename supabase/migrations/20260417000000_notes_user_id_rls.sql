-- Add user_id to notes (table was created by Lovable without it)
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies before (re)creating
DROP POLICY IF EXISTS "Users can manage their own notes" ON public.notes;

CREATE POLICY "Users can manage their own notes"
  ON public.notes
  FOR ALL
  USING (auth.uid() = user_id);
