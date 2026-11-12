import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientContract, ContractFormData, ContractWithContact } from '@/types/contracts';

export async function fetchContactContracts(
  supabase: SupabaseClient,
  contactId: string,
  accountId: string
): Promise<ClientContract[]> {
  const { data, error } = await supabase
    .from('client_contracts')
    .select('*')
    .eq('contact_id', contactId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching contact contracts:', error);
    throw error;
  }

  return (data || []) as ClientContract[];
}

export async function fetchAllAccountContracts(
  supabase: SupabaseClient,
  accountId: string
): Promise<ContractWithContact[]> {
  const { data, error } = await supabase
    .from('client_contracts')
    .select(`
      *,
      contact:contacts (
        id,
        name,
        company,
        phone,
        email
      )
    `)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all contracts:', error);
    throw error;
  }

  return (data || []) as ContractWithContact[];
}

export async function createContract(
  supabase: SupabaseClient,
  params: {
    accountId: string;
    contactId: string;
    userId?: string | null;
    form: ContractFormData;
  }
): Promise<ClientContract> {
  const { data, error } = await supabase
    .from('client_contracts')
    .insert({
      account_id: params.accountId,
      contact_id: params.contactId,
      user_id: params.userId || null,
      title: params.form.title,
      type: params.form.type,
      status: params.form.status,
      setup_price: params.form.setup_price,
      monthly_price: params.form.monthly_price,
      billing_day: params.form.billing_day || null,
      document_url: params.form.document_url || null,
      notes: params.form.notes || null,
      signed_at: params.form.status === 'assinado' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating contract:', error);
    throw error;
  }

  return data as ClientContract;
}

export async function updateContract(
  supabase: SupabaseClient,
  contractId: string,
  form: Partial<ContractFormData>
): Promise<ClientContract> {
  const payload: Record<string, unknown> = {
    ...form,
    updated_at: new Date().toISOString(),
  };

  if (form.status === 'assinado') {
    payload.signed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('client_contracts')
    .update(payload)
    .eq('id', contractId)
    .select()
    .single();

  if (error) {
    console.error('Error updating contract:', error);
    throw error;
  }

  return data as ClientContract;
}

export async function deleteContract(
  supabase: SupabaseClient,
  contractId: string
): Promise<void> {
  const { error } = await supabase
    .from('client_contracts')
    .delete()
    .eq('id', contractId);

  if (error) {
    console.error('Error deleting contract:', error);
    throw error;
  }
}
