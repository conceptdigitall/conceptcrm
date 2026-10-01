'use client';

import { ExternalLink, Globe, MessageCircle, Phone, Star, UserPlus } from 'lucide-react';
import type { Lead, LeadStatus } from '@/types';
import { cn } from '@/lib/utils';
import { safeHttpUrl } from '@/lib/prospecting/url';
import {
  SATISFACTION_LABEL,
  buildOutreachMessage,
  satisfactionLevel,
  whatsappUrl,
  type SatisfactionLevel,
} from '@/lib/prospecting/outreach';
import type { LeadRankingResult } from '@/lib/prospecting/dynamic-search';
import { Button, buttonVariants } from '@/components/ui/button';

export const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  qualificado: 'Qualificado',
  descartado: 'Descartado',
};

const GOOD = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
const MID = 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
const LOW = 'bg-red-500/10 text-red-700 dark:text-red-300';
const NONE = 'bg-muted text-muted-foreground';

const SATISFACTION_TONE: Record<SatisfactionLevel, string> = {
  'muito-alta': GOOD,
  alta: GOOD,
  media: MID,
  baixa: LOW,
  'sem-dados': NONE,
};

function scoreTone(score: number): string {
  if (score >= 60) return GOOD;
  if (score >= 40) return MID;
  return NONE;
}

interface Props {
  lead: Lead;
  rank?: LeadRankingResult;
  canEdit: boolean;
  onApproach: (lead: Lead) => void;
  onPromote: (lead: Lead) => void;
  onStatus: (lead: Lead, status: LeadStatus) => void;
}

export function LeadCard({ lead, rank, canEdit, onApproach, onPromote, onStatus }: Props) {
  const level = satisfactionLevel(lead.rating, lead.review_count);
  const site = safeHttpUrl(lead.website);
  const maps = safeHttpUrl(lead.maps_url);
  const hasWhatsapp = Boolean(lead.phone && lead.is_mobile);
  const rankTone = rank?.probabilityLevel === 'alta' ? GOOD : rank?.probabilityLevel === 'media' ? MID : NONE;

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold" title={lead.name}>{lead.name}</h3>
          <p className="truncate text-xs text-muted-foreground" title={lead.address ?? undefined}>
            {[lead.category, lead.address].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span
          className={cn('shrink-0 rounded-lg px-2 py-1 text-center text-xs font-medium leading-tight', scoreTone(lead.score))}
          title={lead.score_reasons.join(' · ')}
        >
          <span className="block text-base font-bold">{lead.score}</span>
          oportunidade
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {rank && (
          <span className={cn('rounded-md px-2 py-0.5 font-semibold', rankTone)} title={rank.reasons.join(' · ')}>
            {rank.probability}% de chance de fechar
          </span>
        )}
        <span className={cn('rounded-md px-2 py-0.5 font-medium', SATISFACTION_TONE[level])}>
          {SATISFACTION_LABEL[level]}
        </span>
        {lead.rating != null && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Star className="h-3 w-3 fill-current text-amber-500" />
            {lead.rating} ({lead.review_count ?? 0})
          </span>
        )}
      </div>

      {(lead.score_reasons.length > 0 || rank?.reasons[0]) && (
        <p className="text-xs text-muted-foreground">{rank?.reasons[0] ?? lead.score_reasons.join(' · ')}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {lead.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" /> {lead.phone}
          </span>
        )}
        {site ? (
          <a href={site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            <Globe className="h-3 w-3" /> site
          </a>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3" /> sem site
          </span>
        )}
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
        {hasWhatsapp ? (
          <a
            className={cn(buttonVariants({ size: 'sm' }), 'flex-1 bg-[#25D366] text-white hover:bg-[#1ebe5a] sm:flex-none')}
            href={whatsappUrl(lead.phone!, buildOutreachMessage(lead))}
            target="_blank"
            rel="noreferrer"
            onClick={() => onApproach(lead)}
          >
            <MessageCircle className="mr-1 h-4 w-4" /> Abordar no WhatsApp
          </a>
        ) : (
          <span className="flex-1 text-xs text-muted-foreground sm:flex-none">Sem WhatsApp</span>
        )}
        <select
          aria-label="Status do lead"
          className="h-8 rounded-md border bg-background px-2 text-xs"
          value={lead.status}
          disabled={!canEdit}
          onChange={(e) => onStatus(lead, e.target.value as LeadStatus)}
        >
          {Object.entries(STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={!canEdit || !lead.phone || Boolean(lead.contact_id)}
          title={!lead.phone ? 'Lead sem telefone' : lead.contact_id ? 'Já é contato' : 'Salvar nos Contatos'}
          onClick={() => onPromote(lead)}
        >
          <UserPlus className="mr-1 h-4 w-4" /> {lead.contact_id ? 'Contato' : 'Salvar'}
        </Button>
        {maps && (
          <a className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Abrir no Google Maps" aria-label="Abrir no Google Maps" href={maps} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </footer>
    </article>
  );
}
