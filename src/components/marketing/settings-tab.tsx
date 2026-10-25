'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Rocket, Save, Share2, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import type {
  AutopilotFrequency, BusinessNiche, CaptionSize, CaptionStyle,
  EmojiLevel, HashtagGroup, MarketingSettings,
} from '@/types';
import { CAPTION_STYLES, buildCaption } from '@/lib/marketing/content';
import { BUSINESS_NICHES, getNichePreset } from '@/lib/marketing/niche-autopilot';
import { Button } from '@/components/ui/button';
import { InstagramConnectionCard } from '@/components/marketing/instagram-connection-card';

interface SettingsTabProps {
  settings: MarketingSettings;
  onSettingsSaved: (newSettings: MarketingSettings) => void;
}

export function SettingsTab({ settings: initialSettings, onSettingsSaved }: SettingsTabProps) {
  const [businessName, setBusinessName] = useState(initialSettings.business_name || '');
  const [businessNiche, setBusinessNiche] = useState<BusinessNiche>(initialSettings.business_niche || 'geral');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(initialSettings.caption_style);
  const [captionSize, setCaptionSize] = useState<CaptionSize>(initialSettings.caption_size);
  const [emojiLevel, setEmojiLevel] = useState<EmojiLevel>(initialSettings.emoji_level);
  const [cta, setCta] = useState(initialSettings.cta);
  const [neverUse, setNeverUse] = useState(initialSettings.never_use);
  const [hashtags, setHashtags] = useState<HashtagGroup[]>(initialSettings.hashtags || []);
  const [instagramUsername, setInstagramUsername] = useState(initialSettings.instagram_username || '');
  const [requireApproval, setRequireApproval] = useState(initialSettings.require_approval);
  const [approverWhatsapp, setApproverWhatsapp] = useState(initialSettings.approver_whatsapp || '');
  const [dailyScheduleTime, setDailyScheduleTime] = useState(initialSettings.daily_schedule_time || '08:30');
  const [autopilotFrequency, setAutopilotFrequency] = useState<AutopilotFrequency>(
    initialSettings.autopilot_frequency || 'diario',
  );
  const [saving, setSaving] = useState(false);

  const selectedPreset = getNichePreset(businessNiche);
  const previewCaption = buildCaption(
    { business_name: businessName, caption_style: captionStyle, caption_size: captionSize, emoji_level: emojiLevel, cta, hashtags },
    selectedPreset.dailyFeed.idea,
  );

  function applyNicheSuggestions() {
    setCta(selectedPreset.defaultCta);
    setHashtags(selectedPreset.hashtags);
    toast.success(`Sugestões de ${selectedPreset.label} aplicadas! Clique em Salvar no final.`);
  }

  function toggleHashtag(groupIndex: number, tagIndex: number) {
    const updated = [...hashtags];
    const group = { ...updated[groupIndex] };
    const tags = [...group.tags];
    tags[tagIndex] = { ...tags[tagIndex], on: !tags[tagIndex].on };
    group.tags = tags;
    updated[groupIndex] = group;
    setHashtags(updated);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Partial<MarketingSettings> = {
        business_name: businessName,
        business_niche: businessNiche,
        caption_style: captionStyle,
        caption_size: captionSize,
        emoji_level: emojiLevel,
        cta,
        never_use: neverUse,
        hashtags,
        instagram_username: instagramUsername,
        require_approval: requireApproval,
        approver_whatsapp: approverWhatsapp,
        daily_schedule_time: dailyScheduleTime,
        autopilot_frequency: autopilotFrequency,
      };
      const res = await fetch('/api/marketing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Falha ao salvar ajustes');
      const data = await res.json();
      toast.success('Configurações do seu negócio salvas com sucesso!');
      onSettingsSaved(data.settings);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 w-full rounded-2xl border border-border bg-card p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Configuração Fácil do Seu Negócio</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Preencha os dados básicos da sua empresa para a IA criar postagens sob medida para os seus clientes.
          </p>
        </div>

        {/* 1. Nome da Empresa e WhatsApp do Dono */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Nome da sua Empresa</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ex: Barbearia do Alemão"
              className="bg-background border border-border rounded-lg px-3.5 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Seu WhatsApp (para receber prévias)</label>
            <input
              type="tel"
              value={approverWhatsapp}
              onChange={(e) => setApproverWhatsapp(e.target.value)}
              placeholder="Ex: (13) 99999-9999"
              className="bg-background border border-border rounded-lg px-3.5 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* 2. Ramo do Negócio */}
        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-foreground">Qual é o ramo do seu negócio?</label>
            <button
              type="button"
              onClick={applyNicheSuggestions}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Preencher chamada e hashtags de {selectedPreset.label}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BUSINESS_NICHES.map((niche) => (
              <button
                key={niche.value}
                type="button"
                onClick={() => setBusinessNiche(niche.value)}
                className={`p-2.5 rounded-xl border text-left transition-colors flex flex-col gap-0.5 ${
                  businessNiche === niche.value ? 'border-primary bg-primary/10' : 'border-border bg-background'
                }`}
              >
                <span className="text-xs font-bold text-foreground">{niche.label}</span>
                <span className="text-[10px] text-muted-foreground line-clamp-1">{niche.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Escolha do Dono: Aprovar Antes vs Piloto Automático */}
        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
          <label className="text-xs font-semibold text-foreground">Como você prefere que as publicações funcionem?</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRequireApproval(true)}
              className={`p-4 rounded-xl border text-left transition-colors flex flex-col gap-1 ${
                requireApproval ? 'border-primary bg-primary/10' : 'border-border bg-background'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Quero aprovar antes (Recomendado)</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                A IA cria tudo e te avisa no WhatsApp. Nada vai para o Instagram sem você clicar em Aprovar.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRequireApproval(false)}
              className={`p-4 rounded-xl border text-left transition-colors flex flex-col gap-1 ${
                !requireApproval ? 'border-primary bg-primary/10' : 'border-border bg-background'
              }`}
            >
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Piloto Automático</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                A IA gera a pauta do seu ramo e já deixa agendada para publicar automaticamente todos os dias.
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Horário da Pauta Diária</label>
              <input
                type="time"
                value={dailyScheduleTime}
                onChange={(e) => setDailyScheduleTime(e.target.value)}
                className="bg-background border border-border rounded-lg px-3.5 py-2 text-sm text-foreground"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Frequência de Geração</label>
              <select
                value={autopilotFrequency}
                onChange={(e) => setAutopilotFrequency(e.target.value as AutopilotFrequency)}
                className="bg-background border border-border rounded-lg px-3.5 py-2 text-sm text-foreground"
              >
                <option value="diario">Todo dia (Stories + Feed)</option>
                <option value="3x_semana">3 vezes por semana</option>
                <option value="manual">Somente quando eu pedir</option>
              </select>
            </div>
          </div>
        </div>

        {/* 4. Estilo, Tamanho e Emojis */}
        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
          <label className="text-xs font-semibold text-muted-foreground">Jeito de Falar nas Legendas</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CAPTION_STYLES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setCaptionStyle(st.value)}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 ${
                  captionStyle === st.value ? 'border-primary bg-muted' : 'border-border bg-background'
                }`}
              >
                <span className="text-xs font-bold text-foreground">{st.label}</span>
                <span className="text-[11px] text-muted-foreground">{st.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Tamanho do Texto</label>
            <div className="flex gap-2">
              {(['curta', 'media', 'longa'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setCaptionSize(sz)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border capitalize ${
                    captionSize === sz ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Uso de Emojis</label>
            <div className="flex gap-2">
              {(['nenhum', 'poucos', 'muitos'] as const).map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmojiLevel(em)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border capitalize ${
                    emojiLevel === em ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CTA, Proibições, Instagram e Hashtags */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Chamada Final (CTA)</label>
            <input type="text" value={cta} onChange={(e) => setCta(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Palavras Proibidas</label>
            <input type="text" value={neverUse} onChange={(e) => setNeverUse(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5 text-primary" /> Instagram (sem @)
            </label>
            <input type="text" value={instagramUsername} onChange={(e) => setInstagramUsername(e.target.value)} placeholder="suaempresa" className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <label className="text-xs font-semibold text-muted-foreground">Hashtags (Toque para ligar ou desligar)</label>
          {hashtags.map((grp, gIdx) => (
            <div key={grp.group} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-foreground uppercase mr-1">{grp.group}:</span>
              {grp.tags.map((tag, tIdx) => (
                <button
                  key={tag.t}
                  type="button"
                  onClick={() => toggleHashtag(gIdx, tIdx)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    tag.on ? 'bg-primary border-primary/50 text-primary-foreground' : 'bg-background border-border text-muted-foreground/50 line-through'
                  }`}
                >
                  {tag.t}
                </button>
              ))}
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary-hover text-primary-foreground font-bold h-11 rounded-xl gap-2 shadow">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar Configurações do Meu Negócio'}
        </Button>
      </div>

      <div className="w-full lg:w-80 xl:w-96 flex flex-col gap-4">
      <InstagramConnectionCard />

      {/* Prévia ao Vivo */}
      <aside className="w-full rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase font-bold text-foreground">Como vai ficar no seu Instagram</span>
        </div>
        <div className="rounded-xl border border-border bg-background p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center uppercase">
              {(businessName || instagramUsername || 'C')[0]}
            </div>
            <span className="text-xs font-bold text-foreground">@{instagramUsername || 'suaempresa'}</span>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{previewCaption}</p>
        </div>
      </aside>
      </div>
    </div>
  );
}
