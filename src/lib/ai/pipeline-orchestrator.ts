import type { SupabaseClient } from '@supabase/supabase-js';

export interface DealSyncResult {
  dealId: string;
  isNew: boolean;
  stageName?: string;
  status: string;
}

/**
 * Normaliza strings para busca sem acentos e minúsculas
 */
function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Garante que um lead do WhatsApp possua um Deal aberto no pipeline padrão do CRM.
 * Se já houver um deal 'open', apenas retorna. Se não houver, cria na 1ª etapa.
 */
export async function syncLeadDeal(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  contactId: string,
  contactName: string,
  initialMessage?: string
): Promise<DealSyncResult | null> {
  if (!accountId || !contactId) return null;

  try {
    // 1. Verifica se já existe um deal aberto para esse contato
    const { data: existingDeal } = await db
      .from('deals')
      .select('id, status, stage_id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDeal) {
      return {
        dealId: existingDeal.id,
        isNew: false,
        status: existingDeal.status,
      };
    }

    // 2. Busca os pipelines da conta para encontrar o pipeline padrão
    const { data: pipelines, error: pipeErr } = await db
      .from('pipelines')
      .select('id, name, stages:pipeline_stages(id, name, position)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true });

    if (pipeErr || !pipelines || pipelines.length === 0) {
      console.warn('[pipeline-orchestrator] Nenhum pipeline encontrado para a conta:', accountId);
      return null;
    }

    // Seleciona o primeiro pipeline e ordena seus estágios
    const pipeline = pipelines[0];
    const stages = ((pipeline.stages as Array<{ id: string; name: string; position: number }>) || [])
      .slice()
      .sort((a, b) => a.position - b.position);

    if (stages.length === 0) {
      console.warn('[pipeline-orchestrator] Pipeline sem estágios cadastrados:', pipeline.id);
      return null;
    }

    const firstStage = stages[0];
    const dealTitle = `Lead WhatsApp - ${contactName.trim() || 'Sem Nome'}`;

    // 3. Cria o novo deal
    const { data: newDeal, error: createErr } = await db
      .from('deals')
      .insert({
        account_id: accountId,
        user_id: userId,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        contact_id: contactId,
        title: dealTitle,
        value: 1200, // Ticket médio do Ecossistema Concept Digital
        currency: 'BRL',
        status: 'open',
        notes: initialMessage ? `Primeiro contato via WhatsApp: "${initialMessage.slice(0, 300)}"` : null,
      })
      .select('id, status')
      .maybeSingle();

    if (createErr || !newDeal) {
      console.error('[pipeline-orchestrator] Erro ao criar deal para novo lead:', createErr);
      return null;
    }

    console.info(`[pipeline-orchestrator] Novo deal criado: ${newDeal.id} no estágio "${firstStage.name}"`);
    return {
      dealId: newDeal.id,
      isNew: true,
      stageName: firstStage.name,
      status: newDeal.status,
    };
  } catch (err) {
    console.error('[pipeline-orchestrator] Exceção em syncLeadDeal:', err);
    return null;
  }
}

/**
 * Move o Deal do contato para a etapa de reunião/demonstração agendada
 */
export async function advanceDealOnScheduled(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  meetingSummary: {
    scheduledDateFormatted: string;
    notes?: string;
  }
): Promise<boolean> {
  if (!accountId || !contactId) return false;

  try {
    // 1. Localiza o deal aberto mais recente do contato
    const { data: deal } = await db
      .from('deals')
      .select('id, pipeline_id, notes')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!deal) {
      console.info('[pipeline-orchestrator] Nenhum deal aberto para avançar agendamento do contato:', contactId);
      return false;
    }

    // 2. Busca os estágios do pipeline do deal
    const { data: stages } = await db
      .from('pipeline_stages')
      .select('id, name, position')
      .eq('pipeline_id', deal.pipeline_id)
      .order('position', { ascending: true });

    if (!stages || stages.length === 0) return false;

    // Procura por estágio que mencione agendamento/demonstração/reunião
    const scheduledStage =
      stages.find((s) => {
        const norm = normalizeString(s.name);
        return (
          norm.includes('agendad') ||
          norm.includes('reuniao') ||
          norm.includes('demonstrac') ||
          norm.includes('sessao') ||
          norm.includes('apresentac')
        );
      }) || (stages.length > 1 ? stages[1] : stages[0]);

    const updatedNotes = [
      deal.notes,
      `📅 Reunião Agendada: ${meetingSummary.scheduledDateFormatted}`,
      meetingSummary.notes ? `📝 Notas: ${meetingSummary.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const { error: updErr } = await db
      .from('deals')
      .update({
        stage_id: scheduledStage.id,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deal.id);

    if (updErr) {
      console.error('[pipeline-orchestrator] Erro ao mover deal para agendado:', updErr);
      return false;
    }

    console.info(`[pipeline-orchestrator] Deal ${deal.id} movido para estágio "${scheduledStage.name}"`);
    return true;
  } catch (err) {
    console.error('[pipeline-orchestrator] Exceção em advanceDealOnScheduled:', err);
    return false;
  }
}

/**
 * Marca o Deal do contato como Ganho (Won) e atualiza valor/notas quando o cliente paga
 */
export async function recordDealPayment(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  paymentDetails: {
    amount?: number;
    notes?: string;
  }
): Promise<{ success: boolean; dealTitle?: string; value?: number }> {
  if (!accountId || !contactId) return { success: false };

  try {
    const { data: deal } = await db
      .from('deals')
      .select('id, title, value, pipeline_id, notes')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!deal) return { success: false };

    // Busca estágio de "Ganho" / "Fechado" se existir
    const { data: stages } = await db
      .from('pipeline_stages')
      .select('id, name')
      .eq('pipeline_id', deal.pipeline_id);

    const wonStage = (stages || []).find((s) => {
      const norm = normalizeString(s.name);
      return norm.includes('ganh') || norm.includes('fechad') || norm.includes('contratad') || norm.includes('pago');
    });

    const nowIso = new Date().toISOString();
    const finalValue = paymentDetails.amount !== undefined && paymentDetails.amount > 0 ? paymentDetails.amount : deal.value;

    const patch: Record<string, unknown> = {
      status: 'won',
      value: finalValue,
      updated_at: nowIso,
      notes: [deal.notes, `💰 Pagamento/Contrato confirmado em ${nowIso}`, paymentDetails.notes].filter(Boolean).join('\n'),
    };

    if (wonStage) {
      patch.stage_id = wonStage.id;
    }

    const { error: updErr } = await db.from('deals').update(patch).eq('id', deal.id);
    if (updErr) {
      console.error('[pipeline-orchestrator] Erro ao marcar deal como ganho:', updErr);
      return { success: false };
    }

    console.info(`[pipeline-orchestrator] Deal ${deal.id} marcado como WON! Valor: R$ ${finalValue}`);
    return { success: true, dealTitle: deal.title, value: finalValue };
  } catch (err) {
    console.error('[pipeline-orchestrator] Exceção em recordDealPayment:', err);
    return { success: false };
  }
}
