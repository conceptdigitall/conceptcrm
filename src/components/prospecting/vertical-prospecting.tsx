'use client';

import React, { useState, useMemo } from 'react';
import {
  Radar,
  Upload,
  Briefcase,
  Users,
  CalendarCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  NicheKey,
  AVAILABLE_NICHES,
  getNicheConfig,
} from '@/config/niches';
import {
  CandidateContact,
  filterReactivationCandidates,
  ReactivationResult,
} from '@/lib/prospecting/reactivation';
import { ImportedContact } from '@/lib/prospecting/csv-importer';
import { ReactivationRadar } from './reactivation-radar';
import {
  PlaybookPickerModal,
  PlaybookContact,
} from './playbook-picker-modal';
import { CsvImportModal } from './csv-import-modal';

export interface VerticalProspectingProps {
  niche: NicheKey;
  onNicheChange?: (niche: NicheKey) => void;
  contacts: CandidateContact[];
  onImportContacts?: (contacts: ImportedContact[]) => Promise<void> | void;
  onMarkContacted?: (contactId: string, message: string) => Promise<void> | void;
  isLoading?: boolean;
}

export function VerticalProspecting({
  niche,
  onNicheChange,
  contacts,
  onImportContacts,
  onMarkContacted,
  isLoading = false,
}: VerticalProspectingProps) {
  const nicheConfig = useMemo(() => getNicheConfig(niche), [niche]);

  const [activeContact, setActiveContact] = useState<PlaybookContact | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);

  // Compute candidates through the reactivation radar algorithm
  const candidates = useMemo(() => {
    return filterReactivationCandidates(contacts, { niche });
  }, [contacts, niche]);

  // Existing phones for deduplication in CSV importer
  const existingPhones = useMemo(() => {
    return contacts.map((c) => c.phone);
  }, [contacts]);

  const handleSelectCandidate = (item: ReactivationResult) => {
    setActiveContact({
      id: item.contact.id,
      name: item.contact.name,
      phone: item.contact.phone,
      service: (item.contact.metadata?.service as string) || undefined,
    });
  };

  const handleImport = async (importedList: ImportedContact[]) => {
    if (onImportContacts) {
      await onImportContacts(importedList);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner de Boas-Vindas & Configuração de Nicho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-border/80 bg-gradient-to-r from-card to-muted/20 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-[#0624C7]/5 text-[#0624C7] dark:bg-blue-400/10 dark:text-blue-400 font-semibold border-[#0624C7]/30">
              {nicheConfig.badge}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              Prospecção Nativa
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {nicheConfig.label}
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            {nicheConfig.description}
          </p>
        </div>

        {/* Estatísticas Rápidas & Ações */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {onNicheChange && (
            <div className="flex items-center gap-1.5 text-xs bg-background p-1 rounded-xl border border-border/60">
              <Briefcase className="size-3.5 text-muted-foreground ml-1.5" />
              <select
                value={niche}
                onChange={(e) => onNicheChange(e.target.value as NicheKey)}
                className="bg-transparent text-xs font-medium text-foreground py-1 pr-2 outline-none cursor-pointer"
                aria-label="Selecione o nicho vertical"
              >
                {AVAILABLE_NICHES.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => setIsCsvModalOpen(true)}
            className="h-9 text-xs gap-1.5 bg-[#0624C7] hover:bg-[#051db0] text-white cursor-pointer shadow-xs"
          >
            <Upload className="size-3.5" />
            <span>Importar Planilha CSV</span>
          </Button>
        </div>
      </div>

      {/* Cartões de Indicadores Rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border/80 bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Base Total de Clientes</span>
            <Users className="size-4 text-[#0624C7] dark:text-blue-400" />
          </div>
          <span className="text-2xl font-bold text-foreground">
            {contacts.length}
          </span>
          <span className="text-[11px] text-muted-foreground block mt-0.5">
            Cadastrados no CRM
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border/80 bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Prontos para Reativar</span>
            <Radar className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {candidates.length}
          </span>
          <span className="text-[11px] text-muted-foreground block mt-0.5">
            {Math.round((candidates.length / (contacts.length || 1)) * 100)}% da base inativa
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border/80 bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Ciclo Médio de Retorno</span>
            <CalendarCheck className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-2xl font-bold text-foreground">
            {nicheConfig.defaultReactivationDays} dias
          </span>
          <span className="text-[11px] text-muted-foreground block mt-0.5">
            Tempo padrão do nicho
          </span>
        </div>
      </div>

      {/* Radar de Reativação da Base */}
      <ReactivationRadar
        candidates={candidates}
        niche={niche}
        onSelectCandidate={handleSelectCandidate}
        onOpenCsvImporter={() => setIsCsvModalOpen(true)}
        isLoading={isLoading}
      />

      {/* Modais de Ação */}
      <PlaybookPickerModal
        isOpen={Boolean(activeContact)}
        onClose={() => setActiveContact(null)}
        contact={activeContact}
        niche={niche}
        onMarkContacted={onMarkContacted}
      />

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        existingPhones={existingPhones}
        onImport={handleImport}
      />
    </div>
  );
}
