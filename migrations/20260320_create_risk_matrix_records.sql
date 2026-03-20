-- Create table for risk matrix records (encrypted payloads)
-- Date: 2026-03-20

CREATE TABLE IF NOT EXISTS risk_matrix_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_code VARCHAR(50) NOT NULL UNIQUE,
  payload_encrypted TEXT NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index para busca rápida por código
CREATE INDEX IF NOT EXISTS idx_risk_matrix_records_code ON risk_matrix_records(risk_code);

-- Index para ordenação por data
CREATE INDEX IF NOT EXISTS idx_risk_matrix_records_updated_at ON risk_matrix_records(updated_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE risk_matrix_records ENABLE ROW LEVEL SECURITY;

-- Policy: qualquer usuário autenticado pode ler se tiver permissão
-- (a permissão é verificada no app, via riskMatrixAccess no profiles)
CREATE POLICY "risk_matrix_read_authenticated" ON risk_matrix_records
FOR SELECT TO authenticated
USING (true);

-- Policy: apenas admins podem editar
CREATE POLICY "risk_matrix_write_admin_only" ON risk_matrix_records
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

CREATE POLICY "risk_matrix_update_admin_only" ON risk_matrix_records
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

CREATE POLICY "risk_matrix_delete_admin_only" ON risk_matrix_records
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

-- Alter profiles table to add risk_matrix_access column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS risk_matrix_access VARCHAR(10) DEFAULT 'NONE';

-- Index para permissão de risco
CREATE INDEX IF NOT EXISTS idx_profiles_risk_matrix_access ON profiles(risk_matrix_access);
