import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { validateVideoInput } from '@/lib/marketing/validate';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  const parsed = validateVideoInput(body, ctx.accountId);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await ctx.supabase
    .from('marketing_videos')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      prompt: parsed.value.prompt,
      image_paths: parsed.value.imagePaths,
      format: parsed.value.format,
      tone: parsed.value.tone,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data }, { status: 201 });
}
