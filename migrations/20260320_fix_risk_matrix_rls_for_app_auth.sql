-- Fix RLS policies for risk_matrix_records to match current app auth model
-- Context: app currently uses custom profile/session auth (not Supabase Auth JWT)
-- Without this fix, policies TO authenticated + auth.uid() block reads/writes from frontend anon key.

ALTER TABLE risk_matrix_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "risk_matrix_read_authenticated" ON risk_matrix_records;
DROP POLICY IF EXISTS "risk_matrix_write_admin_only" ON risk_matrix_records;
DROP POLICY IF EXISTS "risk_matrix_update_admin_only" ON risk_matrix_records;
DROP POLICY IF EXISTS "risk_matrix_delete_admin_only" ON risk_matrix_records;

-- Keep access control in application layer until Supabase Auth is integrated.
CREATE POLICY "risk_matrix_read_all" ON risk_matrix_records
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "risk_matrix_write_all" ON risk_matrix_records
FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "risk_matrix_update_all" ON risk_matrix_records
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "risk_matrix_delete_all" ON risk_matrix_records
FOR DELETE TO anon, authenticated
USING (true);
