import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  const { id } = await params;

  const { data: lead } = await ctx.supabase
    .from('leads')
    .select('id, name, phone, email, category, contact_id')
    .eq('id', id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
  if (lead.contact_id) return NextResponse.json({ contactId: lead.contact_id, existing: true });
  if (!lead.phone) return NextResponse.json({ error: 'Lead sem telefone' }, { status: 409 });

  // lead.phone is already digits-only (normalizeBrPhone), which is exactly
  // what contacts.phone_normalized holds — so this finds WhatsApp contacts too.
  const { data: existing } = await ctx.supabase
    .from('contacts')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('phone_normalized', lead.phone)
    .maybeSingle();

  let contactId: string;
  if (existing) {
    contactId = existing.id;
  } else {
    const { data: created, error } = await ctx.supabase
      .from('contacts')
      .insert({
        user_id: ctx.userId,
        account_id: ctx.accountId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.name,
      })
      .select('id')
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'Falha ao criar contato' }, { status: 500 });
    }
    contactId = created.id;
  }

  const { error: linkError } = await ctx.supabase
    .from('leads')
    .update({ contact_id: contactId, status: 'contatado', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ contactId, existing: Boolean(existing) });
}
