import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchContactContracts,
  fetchAllAccountContracts,
  createContract,
  updateContract,
  deleteContract,
} from './api';

describe('contracts api', () => {
  it('fetches contact contracts with correct filters', async () => {
    const mockContracts = [
      { id: 'ct-1', title: 'Contrato A', contact_id: 'c-1', account_id: 'acc-1' },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockContracts, error: null }),
      }),
    } as unknown as SupabaseClient;

    const result = await fetchContactContracts(supabase, 'c-1', 'acc-1');
    expect(result).toEqual(mockContracts);
    expect(supabase.from).toHaveBeenCalledWith('client_contracts');
  });

  it('fetches all account contracts including contact relation', async () => {
    const mockData = [
      {
        id: 'ct-1',
        title: 'Vitrine Western',
        contact: { id: 'c-1', name: 'Celeiro' },
      },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    } as unknown as SupabaseClient;

    const result = await fetchAllAccountContracts(supabase, 'acc-1');
    expect(result).toHaveLength(1);
    expect(result[0].contact?.name).toBe('Celeiro');
  });

  it('creates contract and formats input fields', async () => {
    const mockInserted = { id: 'ct-new', title: 'Novo Contrato' };

    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockInserted, error: null }),
      }),
    } as unknown as SupabaseClient;

    const result = await createContract(supabase, {
      accountId: 'acc-1',
      contactId: 'c-1',
      form: {
        title: 'Novo Contrato',
        type: 'avulso',
        status: 'rascunho',
        setup_price: 1500,
        monthly_price: 0,
      },
    });

    expect(result).toEqual(mockInserted);
    expect(supabase.from).toHaveBeenCalledWith('client_contracts');
  });

  it('updates contract and sets signed_at timestamp when marked assinado', async () => {
    const mockUpdated = { id: 'ct-1', status: 'assinado', signed_at: '2026-11-12T00:00:00Z' };

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
      }),
    } as unknown as SupabaseClient;

    const result = await updateContract(supabase, 'ct-1', { status: 'assinado' });
    expect(result.status).toBe('assinado');
  });

  it('deletes contract by id', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as unknown as SupabaseClient;

    await expect(deleteContract(supabase, 'ct-1')).resolves.toBeUndefined();
  });
});
