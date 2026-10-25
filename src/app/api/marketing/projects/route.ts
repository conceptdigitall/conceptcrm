import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import type { MarketingProject, ProjectCategory, ProjectStatus } from '@/types';
import { dbErrorResponse } from '@/lib/marketing/db-error';

export const INITIAL_CONCEPT_PROJECTS: Omit<MarketingProject, 'id' | 'account_id' | 'created_at'>[] = [
  { name: 'Barbearia do Alemão', category: 'landing', url: 'https://barbeariadoalemao.com.br', status: 'live' },
  { name: 'Felipe Gomes Dentista', category: 'landing', url: 'https://felipegomes.vercel.app', status: 'live' },
  { name: 'Circuito FTV Cubatão', category: 'landing', url: 'https://circuito-ftv-cubatao.vercel.app', status: 'building' },
  { name: 'Recepcionista - Barbearia', category: 'recepcionista', url: null, status: 'live' },
  { name: 'Marketing com IA', category: 'marketing', url: null, status: 'soon' },
];

export async function GET() {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }

  const { data, error } = await ctx.supabase
    .from('marketing_projects')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false });

  if (error) return dbErrorResponse('projects', error);

  // Os projetos padrão são clientes da Concept: só a conta interna recebe.
  if ((!data || data.length === 0) && isInternalAccount(ctx.accountId)) {
    // Semeia os projetos padrão da Concept se a conta não tiver nenhum ainda
    const toInsert = INITIAL_CONCEPT_PROJECTS.map((p) => ({
      ...p,
      account_id: ctx.accountId,
    }));

    const { data: inserted } = await ctx.supabase
      .from('marketing_projects')
      .insert(toInsert)
      .select();

    return NextResponse.json({ projects: (inserted ?? toInsert) as MarketingProject[] });
  }

  return NextResponse.json({ projects: (data ?? []) as MarketingProject[] });
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as {
    name: string;
    category?: ProjectCategory;
    url?: string | null;
    status?: ProjectStatus;
  } | null;

  if (!body || !body.name) {
    return NextResponse.json({ error: 'Nome do projeto é obrigatório' }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from('marketing_projects')
    .insert({
      account_id: ctx.accountId,
      name: body.name.trim(),
      category: body.category || 'landing',
      url: body.url?.trim() || null,
      status: body.status || 'live',
    })
    .select()
    .single();

  if (error) return dbErrorResponse('projects', error);
  return NextResponse.json({ project: data as MarketingProject }, { status: 201 });
}
