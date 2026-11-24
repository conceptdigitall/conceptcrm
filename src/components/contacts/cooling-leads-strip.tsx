'use client';

import { useEffect, useState } from 'react';
import { Snowflake } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COOLING_MAX_DAYS, COOLING_MIN_DAYS, coolingDays } from '@/lib/followup/followup';

export interface CoolingLead {
  contactId: string;
  name: string;
  days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Faixa no topo da aba Contatos com os leads esfriando: a última mensagem
 * foi nossa (proposta, orçamento, link) e o cliente não responde há
 * COOLING_MIN_DAYS dias ou mais. Clicar abre o contato para gerar o follow-up.
 */
export function CoolingLeadsStrip({
  onOpen,
  onLoaded,
  reloadKey,
}: {
  onOpen: (contactId: string) => void;
  onLoaded?: (byContact: Record<string, number>) => void;
  reloadKey?: number;
}) {
  const [leads, setLeads] = useState<CoolingLead[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const now = Date.now();
      const { data: last } = await supabase
        .from('conversation_last_message')
        .select('conversation_id, sender_type, created_at')
        .neq('sender_type', 'customer')
        .lte('created_at', new Date(now - COOLING_MIN_DAYS * DAY_MS).toISOString())
        .gte('created_at', new Date(now - (COOLING_MAX_DAYS + 1) * DAY_MS).toISOString())
        .limit(200);
      if (cancelled || !last || last.length === 0) {
        if (!cancelled) {
          setLeads([]);
          onLoaded?.({});
        }
        return;
      }

      const { data: convs } = await supabase
        .from('conversations')
        .select('id, contact_id, contact:contacts(name, phone)')
        .in(
          'id',
          last.map((l) => l.conversation_id),
        );
      if (cancelled) return;

      const byConv = new Map(last.map((l) => [l.conversation_id, l]));
      const out: CoolingLead[] = [];
      for (const c of convs ?? []) {
        const l = byConv.get(c.id);
        const days = coolingDays(l ?? null);
        if (days == null || !c.contact_id) continue;
        const contact = (Array.isArray(c.contact) ? c.contact[0] : c.contact) as
          | { name: string | null; phone: string | null }
          | null;
        out.push({ contactId: c.contact_id, name: contact?.name || contact?.phone || 'Sem nome', days });
      }
      out.sort((a, b) => a.days - b.days);
      setLeads(out);
      onLoaded?.(Object.fromEntries(out.map((l) => [l.contactId, l.days])));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (leads.length === 0) return null;

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Snowflake className="size-4 text-sky-500" />
        Esfriando: {leads.length} {leads.length === 1 ? 'lead sem resposta' : 'leads sem resposta'}
        <span className="text-xs font-normal text-muted-foreground">
          · clique para gerar um follow-up
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {leads.map((l) => (
          <button
            key={l.contactId}
            type="button"
            onClick={() => onOpen(l.contactId)}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-sky-500/60 hover:text-sky-600 transition-colors"
          >
            {l.name} · {l.days}d
          </button>
        ))}
      </div>
    </div>
  );
}
