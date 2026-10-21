import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { DEFAULT_SETTINGS } from '@/lib/marketing/content';
import {
  analyzeTrafficHealth,
  auditMetaAdPolicy,
  generateAdCampaignPlan,
  type AdObjective,
  type TrafficMetricsInput,
} from '@/lib/marketing/ads-squad';
import type { MarketingPost, MarketingSettings } from '@/types';

interface AdsSquadRequestBody {
  action: 'generate_plan' | 'audit_copy' | 'analyze_metrics';
  postId?: string;
  dailyBudgetBrl?: number;
  radiusKm?: number;
  objective?: AdObjective;
  customOffer?: string;
  text?: string;
  metrics?: Partial<TrafficMetricsInput>;
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as AdsSquadRequestBody | null;
  if (!body?.action) {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }

  if (body.action === 'audit_copy') {
    const text = (body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Informe o texto do anúncio para auditar' }, { status: 400 });
    }
    const audit = auditMetaAdPolicy(text);
    return NextResponse.json({ audit });
  }

  if (body.action === 'analyze_metrics') {
    const m = body.metrics || {};
    const diagnosis = analyzeTrafficHealth({
      spendBrl: Number(m.spendBrl ?? 140),
      clicks: Number(m.clicks ?? 60),
      whatsappConversations: Number(m.whatsappConversations ?? 15),
      salesCount: Number(m.salesCount ?? 3),
      averageTicketBrl: Number(m.averageTicketBrl ?? 120),
      daysRunning: Number(m.daysRunning ?? 7),
    });
    return NextResponse.json({ diagnosis });
  }

  if (body.action === 'generate_plan') {
    const { data: settingsRow } = await ctx.supabase
      .from('marketing_settings')
      .select('*')
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    const settings: MarketingSettings = settingsRow
      ? (settingsRow as MarketingSettings)
      : { ...DEFAULT_SETTINGS, account_id: ctx.accountId };

    let post: MarketingPost | null = null;
    if (body.postId) {
      const { data: postRow } = await ctx.supabase
        .from('marketing_posts')
        .select('*')
        .eq('account_id', ctx.accountId)
        .eq('id', body.postId)
        .maybeSingle();
      if (postRow) {
        post = postRow as MarketingPost;
      }
    }

    const plan = generateAdCampaignPlan({
      settings,
      post,
      dailyBudgetBrl: body.dailyBudgetBrl,
      radiusKm: body.radiusKm,
      objective: body.objective,
      customOffer: body.customOffer,
      metrics: body.metrics,
    });

    return NextResponse.json({ plan });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
