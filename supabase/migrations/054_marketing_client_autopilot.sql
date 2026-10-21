-- Migration 054: Produto Marketing Autônomo Multi-Negócio (Nicho, Piloto Automático, WhatsApp do Dono e Tutorial para Leigos)
ALTER TABLE marketing_settings
  ADD COLUMN IF NOT EXISTS business_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_niche TEXT NOT NULL DEFAULT 'geral'
    CHECK (business_niche IN ('barbearia','clinica','adega','advocacia','estetica','comercio','agencia','geral')),
  ADD COLUMN IF NOT EXISTS approver_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS daily_schedule_time TEXT NOT NULL DEFAULT '08:30',
  ADD COLUMN IF NOT EXISTS autopilot_frequency TEXT NOT NULL DEFAULT 'diario'
    CHECK (autopilot_frequency IN ('diario','3x_semana','manual')),
  ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE;
