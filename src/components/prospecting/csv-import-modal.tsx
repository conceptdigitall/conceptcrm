'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  PhoneOff,
  Users,
  CopyX,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  parseAndSanitizeCsv,
  ImportedContact,
  CsvImportSummary,
} from '@/lib/prospecting/csv-importer';

export interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingPhones?: string[] | Set<string>;
  onImport: (contacts: ImportedContact[]) => void;
}

export function CsvImportModal({
  isOpen,
  onClose,
  existingPhones,
  onImport,
}: CsvImportModalProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFileName('');
    setSummary(null);
    setErrorMsg('');
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setErrorMsg('Por favor, envie um arquivo .csv válido.');
      return;
    }

    setErrorMsg('');
    setIsProcessing(true);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          setErrorMsg('O arquivo está vazio.');
          setIsProcessing(false);
          return;
        }

        const parsedSummary = parseAndSanitizeCsv(text, { existingPhones });
        setSummary(parsedSummary);
      } catch {
        setErrorMsg('Erro ao ler e processar o arquivo CSV.');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setErrorMsg('Erro na leitura do arquivo.');
      setIsProcessing(false);
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleConfirmImport = () => {
    if (!summary || summary.validContacts.length === 0) return;
    onImport(summary.validContacts);
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-2xl p-6">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/60">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs bg-muted/40 font-medium">
              Importação Inteligente
            </Badge>
            <span className="text-[11px] text-muted-foreground">Sanitização E.164 + Deduplicação</span>
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Importar Base de Clientes (CSV)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Suba sua lista de clientes para prospecção ativa. Telefones fixos e duplicatas são tratados automaticamente.
          </DialogDescription>
        </DialogHeader>

        {/* Zona de Upload / Drag & Drop */}
        {!summary ? (
          <div className="space-y-4 pt-2">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center ${
                isDragging
                  ? 'border-[#0624C7] bg-[#0624C7]/5 dark:border-blue-400 dark:bg-blue-400/10'
                  : 'border-border/80 hover:border-border hover:bg-muted/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="p-3 rounded-full bg-muted/60 mb-3 text-muted-foreground">
                <UploadCloud className="size-6 text-[#0624C7] dark:text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">
                {isProcessing ? 'Processando arquivo...' : 'Arraste seu arquivo CSV ou clique para selecionar'}
              </span>
              <span className="text-xs text-muted-foreground mt-1 max-w-sm">
                Colunas detectadas automaticamente: Nome, WhatsApp/Telefone, Serviço anterior e Data da última visita.
              </span>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        ) : (
          /* Resumo & Prévia do CSV Processado */
          <div className="space-y-4 pt-2">
            {/* Informação do Arquivo */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <FileSpreadsheet className="size-4 text-[#0624C7] dark:text-blue-400" />
                <span>{fileName}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetState}
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                <X className="size-3" />
                <span>Trocar arquivo</span>
              </Button>
            </div>

            {/* Grid de Métricas de Importação */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-center gap-1.5 text-emerald-600 text-[11px] font-medium">
                  <CheckCircle2 className="size-3.5" />
                  <span>Válidos</span>
                </div>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400 block mt-0.5">
                  {summary.validContacts.length}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-border/80 bg-muted/20">
                <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium">
                  <Users className="size-3.5" />
                  <span>Total Linhas</span>
                </div>
                <span className="text-lg font-bold text-foreground block mt-0.5">
                  {summary.totalRows}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-center gap-1.5 text-amber-600 text-[11px] font-medium">
                  <PhoneOff className="size-3.5" />
                  <span>Fixos (Sem Zap)</span>
                </div>
                <span className="text-lg font-bold text-amber-700 dark:text-amber-400 block mt-0.5">
                  {summary.fixedLineCount}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-border/80 bg-muted/20">
                <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium">
                  <CopyX className="size-3.5" />
                  <span>Duplicados</span>
                </div>
                <span className="text-lg font-bold text-foreground block mt-0.5">
                  {summary.duplicateCount}
                </span>
              </div>
            </div>

            {/* Prévia das primeiras 5 linhas válidas */}
            {summary.validContacts.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground block">
                  Prévia de Contatos Prontos para Abordagem ({Math.min(5, summary.validContacts.length)} de {summary.validContacts.length})
                </span>
                <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40 text-xs">
                  {summary.validContacts.slice(0, 5).map((contact, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-background">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{contact.name}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">+{contact.phone}</span>
                      </div>
                      <div className="text-right">
                        {contact.service && (
                          <span className="text-[11px] text-muted-foreground block">
                            {contact.service}
                          </span>
                        )}
                        {contact.lastDate && (
                          <span className="text-[10px] text-muted-foreground/70 block">
                            Última data: {contact.lastDate}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé de Ação */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="h-9 text-xs cursor-pointer"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={!summary || summary.validContacts.length === 0}
            onClick={handleConfirmImport}
            className="h-9 text-xs gap-1.5 bg-[#0624C7] hover:bg-[#051db0] text-white cursor-pointer shadow-xs disabled:opacity-50"
          >
            <CheckCircle2 className="size-3.5" />
            <span>Confirmar Importação ({summary?.validContacts.length ?? 0})</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
