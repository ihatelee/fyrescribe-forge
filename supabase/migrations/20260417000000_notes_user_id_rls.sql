-- Add user_id to notes and set up user-scoped RLS.
-- Wrapped in a conditional: on clean replay the notes table is created later
-- (20260417002613), so this block is a no-op until that migration runs.
-- In production the table already existed, so the block executes normally.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'notes'
  ) THEN
    ALTER TABLE public.notes
      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

    ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their own notes" ON public.notes;

    CREATE POLICY "Users can manage their own notes"
      ON public.notes
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
