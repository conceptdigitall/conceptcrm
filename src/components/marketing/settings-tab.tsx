'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, Sparkles, Share2 } from 'lucide-react';
import type { CaptionSize, CaptionStyle, EmojiLevel, HashtagGroup, MarketingSettings } from '@/types';
import { CAPTION_STYLES, buildCaption } from '@/lib/marketing/content';
import { Button } from '@/components/ui/button';

interface SettingsTabProps {
  settings: MarketingSettings;
  onSettingsSaved: (newSettings: MarketingSettings) => void;
}

export function SettingsTab({
  settings: initialSettings,
  onSettingsSaved,
}: SettingsTabProps) {
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(initialSettings.caption_style);
  const [captionSize, setCaptionSize] = useState<CaptionSize>(initialSettings.caption_size);
  const [emojiLevel, setEmojiLevel] = useState<EmojiLevel>(initialSettings.emoji_level);
  const [cta, setCta] = useState(initialSettings.cta);
  const [neverUse, setNeverUse] = useState(initialSettings.never_use);
  const [hashtags, setHashtags] = useState<HashtagGroup[]>(initialSettings.hashtags || []);
  const [instagramUsername, setInstagramUsername] = useState(initialSettings.instagram_username || 'conceptdigita.l');
  const [requireApproval, setRequireApproval] = useState(initialSettings.require_approval);
  const [saving, setSaving] = useState(false);

  // Prévia da legenda em tempo real
  const previewCaption = buildCaption(
    { caption_style: captionStyle, caption_size: captionSize, emoji_level: emojiLevel, cta, hashtags },
    'Descubra como colocar a IA para atender e qualificar seus clientes no WhatsApp 24h por dia.',
  );

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
        caption_style: captionStyle,
        caption_size: captionSize,
        emoji_level: emojiLevel,
        cta,
        never_use: neverUse,
        hashtags,
        instagram_username: instagramUsername,
        require_approval: requireApproval,
      };

      const res = await fetch('/api/marketing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao salvar ajustes');
      const data = await res.json();
      toast.success('Ajustes de Marketing salvos com sucesso!');
      onSettingsSaved(data.settings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Coluna Principal dos Formulários */}
      <div className="flex-1 w-full rounded-2xl border border-[#14245C] bg-[#081030] p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-heading font-bold text-white">Personalização e Marca</h2>
          <p className="text-xs text-[#9FB0E6] mt-0.5">
            Defina o tom de voz, chamadas e hashtags que a IA usará nas criações do Instagram.
          </p>
        </div>

        {/* Estilo de Legenda */}
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold text-[#9FB0E6]">Estilo de Legenda</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CAPTION_STYLES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setCaptionStyle(st.value)}
                className={`p-3 rounded-xl border text-left transition-colors flex flex-col gap-0.5 ${
                  captionStyle === st.value
                    ? 'border-[#FCE026] bg-[#0D1948]'
                    : 'border-[#14245C] bg-[#04081E] hover:border-[#14245C]/80'
                }`}
              >
                <span className="text-xs font-bold text-white">{st.label}</span>
                <span className="text-[11px] text-[#9FB0E6]">{st.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tamanho e Emojis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#9FB0E6]">Tamanho da Legenda</label>
            <div className="flex gap-2">
              {(['curta', 'media', 'longa'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setCaptionSize(sz)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors capitalize ${
                    captionSize === sz
                      ? 'bg-[#0624C7] border-[#FCE026] text-white'
                      : 'border-[#14245C] bg-[#04081E] text-[#9FB0E6]'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#9FB0E6]">Quantidade de Emojis</label>
            <div className="flex gap-2">
              {(['nenhum', 'poucos', 'muitos'] as const).map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmojiLevel(em)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors capitalize ${
                    emojiLevel === em
                      ? 'bg-[#0624C7] border-[#FCE026] text-white'
                      : 'border-[#14245C] bg-[#04081E] text-[#9FB0E6]'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CTA e Nunca Usar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#9FB0E6]">Chamada Final (CTA Padrão)</label>
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="bg-[#04081E] border border-[#14245C] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#FCE026]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#9FB0E6]">Nunca Usar (Palavras Proibidas)</label>
            <input
              type="text"
              value={neverUse}
              onChange={(e) => setNeverUse(e.target.value)}
              className="bg-[#04081E] border border-[#14245C] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#FCE026]"
            />
          </div>
        </div>

        {/* Grupos de Hashtags */}
        <div className="flex flex-col gap-3 border-t border-[#14245C] pt-4">
          <label className="text-xs font-semibold text-[#9FB0E6]">Hashtags por Grupos (Clique para ativar/desativar)</label>
          <div className="flex flex-col gap-3">
            {hashtags.map((grp, gIdx) => (
              <div key={grp.group} className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-white uppercase">{grp.group}</span>
                <div className="flex flex-wrap gap-1.5">
                  {grp.tags.map((tag, tIdx) => (
                    <button
                      key={tag.t}
                      type="button"
                      onClick={() => toggleHashtag(gIdx, tIdx)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        tag.on
                          ? 'bg-[#0624C7] border-[#FCE026]/50 text-white'
                          : 'bg-[#04081E] border-[#14245C] text-[#9FB0E6]/50 line-through'
                      }`}
                    >
                      {tag.t}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trava de Aprovação */}
        <div className="flex items-center justify-between border-t border-[#14245C] pt-4">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white">Exigir aprovação antes de publicar</span>
            <span className="text-[11px] text-[#9FB0E6]">Posts e stories nunca vão ao ar sem sua confirmação explícita</span>
          </div>
          <input
            type="checkbox"
            checked={requireApproval}
            onChange={(e) => setRequireApproval(e.target.checked)}
            className="w-4 h-4 rounded border-[#14245C] accent-[#FCE026] cursor-pointer"
          />
        </div>

        {/* Integração Instagram */}
        <div className="flex flex-col gap-2 border-t border-[#14245C] pt-4">
          <label className="text-xs font-semibold text-[#9FB0E6] flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-[#FCE026]" />
            Conta do Instagram
          </label>
          <input
            type="text"
            value={instagramUsername}
            onChange={(e) => setInstagramUsername(e.target.value)}
            className="bg-[#04081E] border border-[#14245C] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#FCE026]"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#FCE026] hover:bg-[#e5ca1f] text-[#04081E] font-bold h-11 rounded-xl gap-2 shadow"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar Ajustes'}
        </Button>
      </div>

      {/* Coluna da direita: Prévia ao Vivo */}
      <aside className="w-full lg:w-80 xl:w-96 rounded-2xl border border-[#14245C] bg-[#081030] p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-[#14245C] pb-3">
          <Sparkles className="w-4 h-4 text-[#FCE026]" />
          <span className="text-xs uppercase font-bold text-white">Prévia da Copy Gerada</span>
        </div>

        <div className="rounded-xl border border-[#14245C] bg-[#04081E] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#FCE026] text-[#04081E] text-xs font-bold flex items-center justify-center">
              C
            </div>
            <span className="text-xs font-bold text-white">@{instagramUsername}</span>
          </div>

          <p className="text-xs text-[#E1E7FC] leading-relaxed whitespace-pre-wrap">
            {previewCaption}
          </p>
        </div>
      </aside>
    </div>
  );
}
