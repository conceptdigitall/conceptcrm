import { barbeariaPack } from './barbearia/pack';
import type { Pack, PackButton, TemplateSpec } from './types';

// Todos os pacotes ficam no código da base; a configuração do deploy liga um.
const PACKS: Record<string, Pack> = {
  [barbeariaPack.niche]: barbeariaPack,
};

export function getPack(niche: string): Pack | null {
  return PACKS[niche] ?? null;
}

// O nicho vem de NEXT_PUBLIC_MARKETING_NICHE (uma por CRM/deploy). Vazio ou
// desconhecido = nenhum pacote, e a aba Marketing segue no fluxo antigo.
// A leitura literal de `process.env.NEXT_PUBLIC_…` é exigida para o Next inlinar.
export function getActivePack(raw: string | undefined = process.env.NEXT_PUBLIC_MARKETING_NICHE): Pack | null {
  const niche = (raw ?? '').trim().toLowerCase();
  return niche ? getPack(niche) : null;
}

export function findButton(pack: Pack, buttonId: string): { button: PackButton; spec: TemplateSpec } | null {
  const button = pack.buttons.find((b) => b.id === buttonId);
  if (!button) return null;
  const spec = pack.templates.find((t) => t.id === button.templateId);
  return spec ? { button, spec } : null;
}
