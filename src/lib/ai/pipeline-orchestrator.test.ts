import { describe, it, expect, vi } from 'vitest';
import {
  syncLeadDeal,
  advanceDealOnScheduled,
  recordDealPayment,
} from './pipeline-orchestrator';

describe('pipeline-orchestrator', () => {
  it('retorna null se accountId ou contactId estiverem vazios', async () => {
    const mockDb = {} as any;
    expect(await syncLeadDeal(mockDb, '', 'user-1', 'cont-1', 'João')).toBeNull();
    expect(await syncLeadDeal(mockDb, 'acc-1', 'user-1', '', 'João')).toBeNull();
  });

  it('reutiliza deal existente se já houver um deal open para o contato', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'deal-existente', status: 'open', stage_id: 'stage-1' },
          error: null,
        }),
      }),
    } as any;

    const result = await syncLeadDeal(mockDb, 'acc-1', 'user-1', 'cont-1', 'João Silva');
    expect(result).toEqual({
      dealId: 'deal-existente',
      isNew: false,
      status: 'open',
    });
  });

  it('cria novo deal no primeiro estágio do primeiro pipeline se não houver deal aberto', async () => {
    let callCount = 0;
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'deals') {
          callCount++;
          if (callCount === 1) {
            // Busca existente
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          } else {
            // Insert
            return {
              insert: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'deal-novo', status: 'open' },
                error: null,
              }),
            };
          }
        }
        if (table === 'pipelines') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pipe-1',
                  name: 'Comercial',
                  stages: [
                    { id: 'stage-1', name: 'Novo Lead', position: 0 },
                    { id: 'stage-2', name: 'Agendado', position: 1 },
                  ],
                },
              ],
              error: null,
            }),
          };
        }
        return {} as any;
      }),
    } as any;

    const result = await syncLeadDeal(mockDb, 'acc-1', 'user-1', 'cont-1', 'Carlos', 'Oi, gostaria de um site');
    expect(result).toEqual({
      dealId: 'deal-novo',
      isNew: true,
      stageName: 'Novo Lead',
      status: 'open',
    });
  });

  it('advanceDealOnScheduled move o deal para estágio de agendamento', async () => {
    const updateSpy = vi.fn().mockReturnThis();
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'deals') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'deal-1', pipeline_id: 'pipe-1', notes: 'Primeiro contato' },
              error: null,
            }),
            update: updateSpy,
          };
        }
        if (table === 'pipeline_stages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                { id: 'stage-lead', name: 'Novo Lead', position: 0 },
                { id: 'stage-meet', name: 'Reunião Agendada', position: 1 },
              ],
              error: null,
            }),
          };
        }
        return {} as any;
      }),
    } as any;

    const success = await advanceDealOnScheduled(mockDb, 'acc-1', 'cont-1', {
      scheduledDateFormatted: 'sexta-feira, 15:00',
      notes: 'Quer ver a demo do CRM',
    });

    expect(success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stage_id: 'stage-meet',
      })
    );
  });

  it('recordDealPayment marca status do deal como won', async () => {
    const updateSpy = vi.fn().mockReturnThis();
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'deals') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'deal-1', title: 'Site Dentista', value: 1200, pipeline_id: 'pipe-1', notes: null },
              error: null,
            }),
            update: updateSpy,
          };
        }
        if (table === 'pipeline_stages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'stage-lead', name: 'Novo Lead' },
                { id: 'stage-won', name: 'Ganho / Fechado' },
              ],
              error: null,
            }),
          };
        }
        return {} as any;
      }),
    } as any;

    const result = await recordDealPayment(mockDb, 'acc-1', 'cont-1', {
      amount: 1500,
      notes: 'Comprovante via Pix enviado',
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe(1500);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'won',
        stage_id: 'stage-won',
        value: 1500,
      })
    );
  });
});
