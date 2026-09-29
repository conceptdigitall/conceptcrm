import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  lead: null as unknown,
  existingContact: null as unknown,
  insertContact: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function supabase() {
  return {
    from: (table: string) => {
      if (table === 'leads') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.lead, error: null }) }) }),
          update: (patch: unknown) => {
            mocks.updateLead(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.existingContact, error: null }) }) }),
        }),
        insert: (row: unknown) => {
          mocks.insertContact(row);
          return { select: () => ({ single: async () => ({ data: { id: 'c-new' }, error: null }) }) };
        },
      };
    },
  };
}

const params = { params: Promise.resolve({ id: 'l-1' }) };
const req = () => new Request('http://localhost/api/prospecting/leads/l-1/promote', { method: 'POST' });
const baseLead = {
  id: 'l-1', name: 'Barbearia X', phone: '5513991234567', email: 'a@b.com',
  category: 'Barbearia', contact_id: null,
};

beforeEach(() => {
  mocks.lead = { ...baseLead };
  mocks.existingContact = null;
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'user-1', supabase: supabase() });
});

describe('POST promote', () => {
  it('creates a contact and links the lead', async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contactId: 'c-new', existing: false });
    expect(mocks.insertContact).toHaveBeenCalledWith({
      user_id: 'user-1', account_id: 'acc-1', name: 'Barbearia X',
      phone: '5513991234567', email: 'a@b.com', company: 'Barbearia X',
    });
    expect(mocks.updateLead).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: 'c-new', status: 'contatado' }),
    );
  });
  it('links to an existing contact with the same phone instead of inserting', async () => {
    mocks.existingContact = { id: 'c-old' };
    const res = await POST(req(), params);
    expect(await res.json()).toEqual({ contactId: 'c-old', existing: true });
    expect(mocks.insertContact).not.toHaveBeenCalled();
  });
  it('is idempotent when already promoted', async () => {
    mocks.lead = { ...baseLead, contact_id: 'c-prev' };
    const res = await POST(req(), params);
    expect(await res.json()).toEqual({ contactId: 'c-prev', existing: true });
    expect(mocks.insertContact).not.toHaveBeenCalled();
  });
  it('409s for a lead without phone', async () => {
    mocks.lead = { ...baseLead, phone: null };
    expect((await POST(req(), params)).status).toBe(409);
  });
  it('404s for a lead not visible to the caller', async () => {
    mocks.lead = null;
    expect((await POST(req(), params)).status).toBe(404);
  });
});
