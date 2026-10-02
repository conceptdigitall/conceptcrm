-- ============================================================
-- SCRIPT DE SEED: BARBEARIA DO ALEMÃO 777 (KAWE)
-- Este script pode ser executado no SQL Editor do Supabase a qualquer momento.
-- Ele é 100% idempotente (pode rodar várias vezes sem erros).
-- ============================================================

-- 1. Garante compatibilidade de constraints legadas
ALTER TABLE public.accounts ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE public.pipelines ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.message_templates ALTER COLUMN user_id DROP NOT NULL;

DO $$
DECLARE
  v_user_id UUID;
  v_account_id UUID;
  v_pipeline_id UUID := 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
BEGIN
  -- 1. Captura o usuário principal do auth.users (se já existir)
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

  -- 2. Verifica se este usuário já tem uma conta vinculada (evita violar idx_accounts_one_per_owner)
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_account_id FROM public.accounts WHERE owner_user_id = v_user_id LIMIT 1;
  END IF;

  -- 3. Se não tem pelo usuário, verifica se a conta padrão fixa já existe
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM public.accounts WHERE id = '98195cca-d7ca-415d-b1c1-cc04106c307e' LIMIT 1;
  END IF;

  -- 4. Se a conta existe, atualiza para Barbearia do Alemão 777; senão, cria uma nova
  IF v_account_id IS NOT NULL THEN
    UPDATE public.accounts
    SET name = 'Barbearia do Alemão 777',
        default_currency = 'BRL',
        updated_at = NOW()
    WHERE id = v_account_id;
  ELSE
    v_account_id := '98195cca-d7ca-415d-b1c1-cc04106c307e';
    INSERT INTO public.accounts (id, name, default_currency, owner_user_id, created_at, updated_at)
    VALUES (
      v_account_id,
      'Barbearia do Alemão 777',
      'BRL',
      v_user_id,
      NOW(),
      NOW()
    );
  END IF;

  -- 5. Atualiza o profile do usuário como owner da conta encontrada
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
    SELECT
      v_user_id,
      COALESCE(raw_user_meta_data->>'full_name', 'Kawe Alemão'),
      email,
      v_account_id,
      'owner'::account_role_enum
    FROM auth.users
    WHERE id = v_user_id
    ON CONFLICT (user_id) DO UPDATE SET
      account_id = v_account_id,
      account_role = 'owner';
  END IF;

  -- 6. Inserir ou atualizar Pipeline Oficial vinculado à conta v_account_id e user_id
  INSERT INTO public.pipelines (id, user_id, account_id, name, created_at)
  VALUES (
    v_pipeline_id,
    v_user_id,
    v_account_id,
    'Funil de Vendas - Barbearia do Alemão 777',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, public.pipelines.user_id),
    account_id = v_account_id,
    name = EXCLUDED.name;

  -- 7. Inserir Estágios do Pipeline (coluna 'position' correta)
  INSERT INTO public.pipeline_stages (id, pipeline_id, name, "position", color, created_at)
  VALUES
    ('b1000000-0000-0000-0000-000000000001', v_pipeline_id, 'Novos Leads', 0, '#3B82F6', NOW()),
    ('b1000000-0000-0000-0000-000000000002', v_pipeline_id, 'Agendado', 1, '#C5A880', NOW()),
    ('b1000000-0000-0000-0000-000000000003', v_pipeline_id, 'Atendimento Concluído', 2, '#10B981', NOW()),
    ('b1000000-0000-0000-0000-000000000004', v_pipeline_id, 'Retorno (15-30 dias)', 3, '#F59E0B', NOW()),
    ('b1000000-0000-0000-0000-000000000005', v_pipeline_id, 'Cliente VIP / Fidelizado', 4, '#8B5CF6', NOW())
  ON CONFLICT (id) DO UPDATE SET
    pipeline_id = EXCLUDED.pipeline_id,
    name = EXCLUDED.name,
    "position" = EXCLUDED."position",
    color = EXCLUDED.color;

  -- 8. Inserir Modelos de Mensagem WhatsApp para a Barbearia (colunas: body_text, status em maiúsculas)
  DELETE FROM public.message_templates
  WHERE (account_id = v_account_id OR (v_user_id IS NOT NULL AND user_id = v_user_id))
    AND name IN ('confirmacao_agendamento', 'lembrete_retorno', 'lembrete_24h_antes', 'combo_promocional_90');

  INSERT INTO public.message_templates (id, account_id, user_id, name, category, language, body_text, status, created_at, updated_at)
  VALUES
    (
      gen_random_uuid(),
      v_account_id,
      v_user_id,
      'confirmacao_agendamento',
      'Utility',
      'pt_BR',
      'Fala {{1}}! Confirmando seu agendamento de {{2}} para hoje às {{3}} na Barbearia do Alemão 777. Endereço: Rua Espanha, 360 - Jardim Casqueiro, Cubatão. Qualquer imprevisto nos avise por aqui!',
      'APPROVED',
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      v_account_id,
      v_user_id,
      'lembrete_retorno',
      'Marketing',
      'pt_BR',
      'Fala {{1}}! Já faz {{2}} dias desde seu último corte aqui na Barbearia do Alemão 777. Que tal mantermos o visual alinhado essa semana? Responda essa mensagem para agendar seu horário!',
      'APPROVED',
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      v_account_id,
      v_user_id,
      'lembrete_24h_antes',
      'Utility',
      'pt_BR',
      'E aí {{1}}! Tudo certo? Passando para lembrar do seu horário de {{2}} amanhã às {{3}} com o Alemão. Te esperamos!',
      'APPROVED',
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      v_account_id,
      v_user_id,
      'combo_promocional_90',
      'Marketing',
      'pt_BR',
      'Fala {{1}}! Conhece o nosso Combo Completo? Corte degradê ou clássico + Barboterapia relaxante com toalha quente + Design de sobrancelha na navalha por apenas R$ 90,00! Quer garantir seu horário essa semana?',
      'APPROVED',
      NOW(),
      NOW()
    );

  -- 9. Inserir Base de Conhecimento da IA (ai_knowledge_documents) para o Atendente Virtual
  DELETE FROM public.ai_knowledge_documents
  WHERE account_id = v_account_id
    AND title IN ('Tabela de Serviços e Preços da Barbearia', 'Horário de Funcionamento e Localização', 'Regras de Agendamento e Cancelamento');

  INSERT INTO public.ai_knowledge_documents (id, account_id, created_by, title, content, created_at, updated_at)
  VALUES
    (
      gen_random_uuid(),
      v_account_id,
      v_user_id,
      'Tabela de Serviços e Preços da Barbearia',
      'Serviços oferecidos pela Barbearia do Alemão 777:
- Corte de Cabelo (Tradicional, Degradê, Navalhado, Social): R$ 40,00 (30 minutos)
- Barba (Barboterapia relaxante com toalha quente, navalha e óleo hidratante): R$ 35,00 (30 minutos)
- Combo Corte + Barba: R$ 75,00 (60 minutos)
- Combo Completo (Corte + Barba + Sobrancelha na navalha): R$ 90,00 (75 minutos)
- Design de Sobrancelha na navalha: R$ 20,00 (15 minutos)
- Acabamento e Pezinho: R$ 15,00 (15 minutos)
Formas de pagamento: Pix, Cartão de Débito, Cartão de Crédito e Dinheiro.',
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      v_account_id,
      v_user_id,
      'Horário de Funcionamento e Localização',
      'A Barbearia do Alemão 777 funciona de Segunda a Sábado, das 09:00 às 19:00.
Fechado aos Domingos e Feriados.
Endereço: Rua Espanha, 360 - Jardim Casqueiro, Cubatão - SP, CEP 11530-080.
Barbeiros da equipe: Kawe (Alemão) - Proprietário e Johann.
WhatsApp de Atendimento e Agendamentos: +55 (13) 97424-9209.
Instagram Oficial: @barbeariadoalemao777',
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      v_account_id,
      v_user_id,
      'Regras de Agendamento e Cancelamento',
      'Agendamentos podem ser realizados diretamente pelo site oficial ou pelo WhatsApp da Barbearia.
Pedimos que o cliente chegue com 5 minutos de antecedência. A tolerância máxima de atraso é de 10 minutos para não comprometer os próximos clientes da grade.
Em caso de imprevisto ou necessidade de reagendamento, avisar com pelo menos 1 hora de antecedência.',
      NOW(),
      NOW()
    );

END $$;

-- Recarrega o cache do PostgREST para expor as tabelas e schemas instantaneamente à API
NOTIFY pgrst, 'reload schema';
