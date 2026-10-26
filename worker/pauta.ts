// Pauta semanal de marketing: o Haiku propõe 5 a 7 itens por semana, o João
// decide cada um pelo celular. Este worker gera a pauta (segunda 07:00 BRT ou
// quando a API pede), reescreve itens com pedido de ajuste e transforma os
// aprovados em vídeo + post rascunho. Nunca publica nada sozinho.
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { weekStart } from '@/lib/marketing/autopilot';
import { DEFAULT_SETTINGS } from '@/lib/marketing/content';
import {
  PAUTA_SYSTEM,
  ajustePrompt,
  parseItemAjustado,
  parsePautaItens,
  pautaPrompt,
  semanaInicioISO,
} from '@/lib/marketing/pauta';
import type { VideoStyle } from '@/lib/marketing/video-options';
import type { MarketingPautaItem, MarketingSettings, PautaFormato, VideoTone } from '@/types';
import { enqueuePostWithVideo, type PautaSlot } from './autopilot';
import { HAIKU_MODEL } from './video-models';

export interface PautaDeps {
  now(): Date;
  generateText(system: string, content: string): Promise<string>;
}

// Falha de IA não é refeita na hora (chave própria, separada da do piloto).
const RETRY_AFTER_MS = 60 * 60 * 1000;
const START_AFTER_MS = 7 * 60 * 60 * 1000; // segunda 07:00 BRT
const lastFailure = new Map<string, number>();

const STYLE_CYCLE: VideoStyle[] = ['kinetic', 'whiteboard', 'cutout', 'contador'];
const TONE_CYCLE: VideoTone[] = ['default', 'app-store', 'polished', 'cinematic'];

/** Mídia de cada formato da pauta; `n` faz estilo e tom girarem como no piloto. */
export function slotDoFormato(f: PautaFormato, n: number): PautaSlot {
  const style = STYLE_CYCLE[n % STYLE_CYCLE.length];
  const tone = TONE_CYCLE[n % TONE_CYCLE.length];
  if (f === 'feed') {
    return { kind: 'feed', mediaType: 'foto', format: 'square', tone, options: { style, duration: 15, target: 'reels', still: true, pauta: true } };
  }
  if (f === 'reel') {
    return { kind: 'feed', mediaType: 'video', format: 'vertical', tone, options: { style, duration: 30, target: 'reels', pauta: true } };
  }
  return { kind: 'story', mediaType: 'video', format: 'vertical', tone, options: { style, duration: 15, target: 'story', pauta: true } };
}

/** Faz uma coisa por conta (aprovado → ajuste → gerar → fechar). true se fez algo. */
export async function runPautaTick(db: SupabaseClient, accountIds: string[], deps: PautaDeps): Promise<boolean> {
  const now = deps.now();
  for (const accountId of accountIds) {
    try {
      const failedAt = lastFailure.get(accountId);
      const blocked = failedAt !== undefined && now.getTime() - failedAt < RETRY_AFTER_MS;
      if (await produzirAprovado(db, accountId)) return true;
      if (!blocked && await reescreverAjuste(db, accountId, deps, now)) return true;
      if (!blocked && await gerarPauta(db, accountId, deps, now)) return true;
      if (await fecharPauta(db, accountId, now)) return true;
    } catch (err) {
      lastFailure.set(accountId, now.getTime());
      console.error(`[pauta] conta ${accountId}:`, err instanceof Error ? err.message : err);
    }
  }
  return false;
}

async function produzirAprovado(db: SupabaseClient, accountId: string): Promise<boolean> {
  const { data, error } = await db
    .from('marketing_pauta_itens')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'aprovado')
    .is('post_id', null)
    .limit(1);
  if (error) throw new Error(`Não consegui ler os aprovados: ${error.message}`);
  const item = (data as MarketingPautaItem[] | null)?.[0];
  if (!item) return false;

  const { data: irmaos } = await db.from('marketing_pauta_itens').select('post_id').eq('pauta_id', item.pauta_id);
  const n = (irmaos ?? []).filter((r) => r.post_id).length;
  const { postId } = await enqueuePostWithVideo(db, accountId, slotDoFormato(item.formato, n), {
    title: item.tema,
    brief: `${item.gancho}\n${item.roteiro}`.slice(0, 1000),
    caption: item.legenda_base,
  });
  const { error: uErr } = await db
    .from('marketing_pauta_itens')
    .update({ post_id: postId, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  if (uErr) throw new Error(`Não consegui ligar o post ao item: ${uErr.message}`);
  console.log(`[pauta] aprovado em produção: ${item.tema}`);
  return true;
}

async function reescreverAjuste(db: SupabaseClient, accountId: string, deps: PautaDeps, now: Date): Promise<boolean> {
  const { data, error } = await db
    .from('marketing_pauta_itens')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'ajuste')
    .limit(1);
  if (error) throw new Error(`Não consegui ler os ajustes: ${error.message}`);
  const item = (data as MarketingPautaItem[] | null)?.[0];
  if (!item) return false;

  const raw = await deps.generateText(PAUTA_SYSTEM, ajustePrompt(item, item.comentario ?? ''));
  const novo = parseItemAjustado(raw);
  if (!novo) throw new Error('A IA não devolveu o item reescrito');
  const { error: uErr } = await db
    .from('marketing_pauta_itens')
    .update({ ...novo, versao: item.versao + 1, status: 'pending_approval', comentario: null, updated_at: now.toISOString() })
    .eq('id', item.id);
  if (uErr) throw new Error(`Não consegui gravar o ajuste: ${uErr.message}`);
  console.log(`[pauta] ajuste reescrito: ${novo.tema}`);
  return true;
}

async function gerarPauta(db: SupabaseClient, accountId: string, deps: PautaDeps, now: Date): Promise<boolean> {
  // Pedida pela API ("gerar agora"): já existe, status gerando, em qualquer horário.
  const { data: pedidas } = await db
    .from('marketing_pautas')
    .select('id, semana_inicio')
    .eq('account_id', accountId)
    .eq('status', 'gerando')
    .limit(1);
  let pauta = (pedidas as { id: string; semana_inicio: string }[] | null)?.[0] ?? null;

  if (!pauta) {
    const semana = semanaInicioISO(now);
    const { data: existente } = await db
      .from('marketing_pautas').select('id').eq('account_id', accountId).eq('semana_inicio', semana).maybeSingle();
    if (existente) return false;
    if (now.getTime() < weekStart(now).getTime() + START_AFTER_MS) return false;
    const { data: criada, error } = await db
      .from('marketing_pautas')
      .insert({ account_id: accountId, semana_inicio: semana, status: 'gerando' })
      .select('id, semana_inicio')
      .single();
    if (error || !criada) throw new Error(`Não consegui criar a pauta: ${error?.message}`);
    pauta = criada as { id: string; semana_inicio: string };
  }

  const [{ data: settingsRow }, { data: projects }, { data: recent }] = await Promise.all([
    db.from('marketing_settings').select('*').eq('account_id', accountId).maybeSingle(),
    db.from('marketing_projects').select('name, category').eq('account_id', accountId).limit(20),
    db.from('marketing_posts').select('title').eq('account_id', accountId).order('created_at', { ascending: false }).limit(15),
  ]);
  const settings = (settingsRow as MarketingSettings | null) ?? { ...DEFAULT_SETTINGS, account_id: accountId };

  const raw = await deps.generateText(PAUTA_SYSTEM, pautaPrompt({
    semanaInicio: pauta.semana_inicio,
    settings,
    projects: (projects ?? []).map((p) => `${p.name} (${p.category})`),
    recentTitles: (recent ?? []).map((p) => p.title).filter(Boolean),
  }));
  const itens = parsePautaItens(raw, pauta.semana_inicio);
  if (!itens) throw new Error('A IA não devolveu uma pauta válida');

  const stamp = now.toISOString();
  const { error: iErr } = await db.from('marketing_pauta_itens').insert(
    itens.map((i) => ({ ...i, pauta_id: pauta.id, account_id: accountId, status: 'pending_approval', versao: 1, updated_at: stamp })),
  );
  if (iErr) throw new Error(`Não consegui gravar os itens: ${iErr.message}`);
  const { error: pErr } = await db.from('marketing_pautas').update({ status: 'pending_approval' }).eq('id', pauta.id);
  if (pErr) throw new Error(`Não consegui liberar a pauta: ${pErr.message}`);
  console.log(`[pauta] semana ${pauta.semana_inicio}: ${itens.length} itens para aprovar`);
  return true;
}

async function fecharPauta(db: SupabaseClient, accountId: string, now: Date): Promise<boolean> {
  const { data: abertas } = await db
    .from('marketing_pautas').select('id').eq('account_id', accountId).eq('status', 'pending_approval');
  for (const p of (abertas as { id: string }[] | null) ?? []) {
    const { data: itens } = await db.from('marketing_pauta_itens').select('status').eq('pauta_id', p.id);
    const aberto = (itens ?? []).some((i) => i.status === 'pending_approval' || i.status === 'ajuste');
    if (aberto) continue;
    const { error } = await db.from('marketing_pautas').update({ status: 'fechada' }).eq('id', p.id);
    if (error) throw new Error(`Não consegui fechar a pauta: ${error.message}`);
    console.log(`[pauta] fechada (${now.toISOString().slice(0, 10)})`);
    return true;
  }
  return false;
}

/** Haiku para pauta e reescrita (mesma conta Anthropic do worker de vídeo). */
export async function generateTextHaiku(system: string, content: string): Promise<string> {
  const r = await new Anthropic().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 3000,
    system,
    messages: [{ role: 'user', content }],
  });
  return r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}
