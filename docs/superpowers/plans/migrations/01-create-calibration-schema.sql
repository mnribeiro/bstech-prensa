-- Schema dedicado pra calibração de equipamentos (prensa de concreto, etc)
CREATE SCHEMA IF NOT EXISTS calibration;

CREATE TABLE calibration.calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  equipment_id uuid REFERENCES public.lab_equipment(id),
  numero text NOT NULL,
  identificacao text,
  equipamento_nome text NOT NULL,
  carga_digital_ton numeric(10,2),
  transdutor_marca text,
  escala_min_kgf integer DEFAULT 0,
  escala_max_kgf integer NOT NULL,
  validade date NOT NULL,
  temperatura_celsius numeric(5,2),
  calibrado_por text,
  observacoes text,
  pdf_path text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE calibration.calibration_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_id uuid NOT NULL REFERENCES calibration.calibrations(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  carga_real_kgf integer NOT NULL,
  leitura_1_kgf numeric(10,2) NOT NULL,
  leitura_2_kgf numeric(10,2) NOT NULL,
  leitura_3_kgf numeric(10,2) NOT NULL,
  media_kgf numeric(10,2) NOT NULL,
  desvio_padrao numeric(10,2) NOT NULL,
  erro_exatidao_pct numeric(6,2) NOT NULL,
  repetitividade_pct numeric(6,2) NOT NULL,
  UNIQUE (calibration_id, ordem)
);

CREATE INDEX idx_calibrations_client ON calibration.calibrations(client_id, created_at DESC);
CREATE INDEX idx_calibration_points_cal ON calibration.calibration_points(calibration_id, ordem);

ALTER TABLE calibration.calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration.calibration_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_iso_read" ON calibration.calibrations
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
  );
CREATE POLICY "client_iso_write" ON calibration.calibrations
  FOR ALL USING (
    client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "points_iso_read" ON calibration.calibration_points
  FOR SELECT USING (
    calibration_id IN (
      SELECT id FROM calibration.calibrations
      WHERE client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "points_iso_write" ON calibration.calibration_points
  FOR ALL USING (
    calibration_id IN (
      SELECT id FROM calibration.calibrations
      WHERE client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

GRANT USAGE ON SCHEMA calibration TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA calibration TO authenticated, service_role;
