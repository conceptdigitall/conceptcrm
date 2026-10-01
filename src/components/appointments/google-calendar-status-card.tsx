'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  CalendarCheck,
  ShieldCheck,
  ExternalLink,
  Link2,
  AlertTriangle,
  Info,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface StatusData {
  mode: 'service_account' | 'ical' | 'webhook' | 'local_crm';
  modeLabel: string;
  description: string;
  hasIcal?: boolean;
  maskedIcalUrl?: string | null;
  businessHours: {
    workingDaysText: string;
  };
}

interface AvailabilitySlot {
  time: string;
}

interface AvailabilityTestResult {
  isWorkingDay: boolean;
  formattedWhatsApp?: string;
  replyText?: string;
  suggestedSlots?: string[];
  availableSlots?: AvailabilitySlot[];
}

export function GoogleCalendarStatusCard({ onRefresh }: { onRefresh?: () => void }) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form de conexão iCal
  const [icalInput, setIcalInput] = useState('');
  const [savingIcal, setSavingIcal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testingSync, setTestingSync] = useState(false);

  // Simulador de IA
  const [testDate, setTestDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [testResult, setTestResult] = useState<AvailabilityTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('[CalendarStatusCard] Falha ao carregar status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleInputChange = (val: string) => {
    // Sanitização inteligente em tempo real
    let clean = val.trim();
    clean = clean.replace(/^[A-Za-z0-9_]+\s*=\s*/i, '');
    clean = clean.replace(/^['"]+|['"]+$/g, '');
    setIcalInput(clean);
  };

  const handleSaveIcal = async () => {
    if (!icalInput.trim()) {
      toast.error('Cole o endereço secreto iCal da sua agenda do Google.');
      return;
    }

    setSavingIcal(true);
    try {
      const res = await fetch('/api/calendar/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icalUrl: icalInput }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao validar a URL do calendário.');
      }

      toast.success(
        data.calendarName
          ? `Agenda "${data.calendarName}" conectada com sucesso! (${data.eventsCount} eventos encontrados)`
          : `Google Agenda conectada com sucesso! (${data.eventsCount} eventos encontrados)`
      );

      setIcalInput('');
      await fetchStatus();
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSavingIcal(false);
    }
  };

  const handleDisconnectIcal = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/calendar/config', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao desconectar.');
      }

      toast.success('Google Agenda desconectada com sucesso.');
      await fetchStatus();
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTestSyncNow = async () => {
    setTestingSync(true);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const iso = tomorrow.toISOString().split('T')[0];

      const res = await fetch(`/api/calendar/availability?date=${iso}&duration=30`);
      if (res.ok) {
        toast.success('Sincronização ativa! Compromissos lidos em tempo real.');
        fetchStatus();
      } else {
        toast.error('Erro na resposta do calendário.');
      }
    } catch {
      toast.error('Falha ao comunicar com o Google Agenda.');
    } finally {
      setTestingSync(false);
    }
  };

  const runAvailabilityTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/calendar/availability?date=${testDate}&duration=30`);
      const data = (await res.json()) as AvailabilityTestResult;
      setTestResult(data);
    } catch {
      toast.error('Erro ao consultar disponibilidade.');
    } finally {
      setTesting(false);
    }
  };

  const getBadgeStyle = () => {
    if (status?.mode === 'service_account') {
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    }
    if (status?.mode === 'ical') {
      return 'bg-[#0624C7]/10 text-[#0624C7] dark:text-blue-400 border-[#0624C7]/20';
    }
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  };

  const isConnected = status?.hasIcal || status?.mode === 'ical' || status?.mode === 'service_account';

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-5 shadow-sm transition-all hover:border-border">
        {/* Glow de fundo sutil com Concept Blue */}
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-[#0624C7]/5 blur-3xl" />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Lado Esquerdo: Identificação e Status */}
          <div className="flex items-start gap-3.5">
            <div className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#0624C7]/10 text-[#0624C7] shadow-inner">
              <Calendar className="size-5" />
              <span className="absolute -bottom-0.5 -right-0.5 flex size-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">Sincronização Google Calendar + IA</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getBadgeStyle()}`}
                >
                  <ShieldCheck className="size-3" />
                  {loading ? 'Verificando...' : status?.modeLabel || 'Ativo'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {status?.description ||
                  'O atendente de IA no WhatsApp consulta a agenda em tempo real e sugere horários disponíveis sem conflito.'}
              </p>
            </div>
          </div>

          {/* Lado Direito: Ações rápidas */}
          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTestOpen(true);
                runAvailabilityTest();
              }}
              className="gap-1.5 text-xs font-medium hover:border-[#0624C7]/40 hover:text-[#0624C7] cursor-pointer transition-colors duration-200"
            >
              <Sparkles className="size-3.5 text-[#FCE026]" />
              Testar IA na Agenda
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setConnectOpen(true)}
              className="gap-1.5 text-xs font-medium border-[#0624C7]/30 text-[#0624C7] dark:text-blue-400 hover:bg-[#0624C7]/10 cursor-pointer transition-colors duration-200"
            >
              <Link2 className="size-3.5" />
              {isConnected ? 'Configurar Agenda' : 'Conectar Google Agenda'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                fetchStatus();
                onRefresh?.();
                toast.success('Status da agenda atualizado.');
              }}
              className="size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-200"
              title="Recarregar status"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Rodapé do Card com Regras Vigentes */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-[#0624C7]" />
            <span>{status?.businessHours?.workingDaysText || 'Segunda a Sábado, 09h às 18h (Almoço 12h-13h)'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>
              Duração: <strong>30 min</strong> (Google Meet automático)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarCheck className="size-3.5 text-[#FCE026]" />
            <span>
              Sugestão da IA: <strong>2 a 3 horários</strong> sem sobreposição
            </span>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* Modal UI/UX Pro Max: Conectar Google Agenda sem Google Cloud         */}
      {/* =================================================================== */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#0624C7]/10 text-[#0624C7]">
                <Calendar className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-foreground">
                  Conectar com o Google Calendar
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Sincronização em tempo real para o CRM e o atendente de IA no WhatsApp.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Banner Educativo Crucial Anti-Erro */}
          <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3.5 text-xs text-foreground">
            <div className="flex items-start gap-2.5">
              <Info className="size-4 shrink-0 text-[#0624C7] dark:text-blue-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[#0624C7] dark:text-blue-300">
                  Como funciona esta sincronização:
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  O fluxo é do <strong>Google Agenda para o CRM</strong>. Você <strong>não</strong> precisa
                  adicionar nada dentro do Google Agenda! O Google já gera um endereço secreto da sua agenda
                  existente e você apenas <strong>cola esse link aqui embaixo</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Seção: Estado Atual da Conexão */}
          {status?.hasIcal && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Google Agenda Conectada com Sucesso
                  </span>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">iCal Privado</span>
              </div>

              <div className="rounded-lg bg-background/80 p-2.5 border border-border/60">
                <p className="text-[11px] text-muted-foreground mb-0.5">Endereço sincronizado:</p>
                <p className="text-xs font-mono text-foreground break-all">{status.maskedIcalUrl}</p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestSyncNow}
                  disabled={testingSync}
                  className="gap-1.5 text-xs h-8 cursor-pointer hover:border-[#0624C7]/40 hover:text-[#0624C7]"
                >
                  <RefreshCw className={`size-3.5 ${testingSync ? 'animate-spin' : ''}`} />
                  {testingSync ? 'Testando leitura...' : 'Testar Sincronização Agora'}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisconnectIcal}
                  disabled={disconnecting}
                  className="gap-1.5 text-xs h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer ml-auto"
                >
                  <Trash2 className="size-3.5" />
                  {disconnecting ? 'Desconectando...' : 'Desconectar Agenda'}
                </Button>
              </div>
            </div>
          )}

          {/* Passo a Passo Visual Guiado */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              {status?.hasIcal ? 'Como alterar ou obter o link novamente:' : 'Passo a passo para conectar em 1 minuto:'}
            </h4>

            {/* Passo 1 */}
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0624C7] text-xs font-bold text-white">
                1
              </span>
              <div className="flex-1 text-xs">
                <p className="font-semibold text-foreground">Abra as Configurações do Google Agenda</p>
                <p className="text-muted-foreground mt-0.5">
                  No computador, na barra lateral esquerda (sob <em>Configurações das minhas agendas</em>), clique na sua
                  agenda <strong>Concept Digital</strong> (ou na sua agenda principal).
                </p>
                <a
                  href="https://calendar.google.com/calendar/u/0/r/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0624C7] dark:text-blue-400 hover:underline mt-1.5 cursor-pointer"
                >
                  <ExternalLink className="size-3" />
                  Abrir Configurações do Google Agenda no navegador
                </a>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0624C7] text-xs font-bold text-white">
                2
              </span>
              <div className="flex-1 text-xs">
                <p className="font-semibold text-foreground">Copie o Endereço Secreto em Formato iCal</p>
                <p className="text-muted-foreground mt-0.5">
                  Role a página até a seção <strong>Integrar agenda</strong>. Localize o campo{' '}
                  <strong>&quot;Endereço secreto em formato iCal&quot;</strong> e copie o link.
                </p>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3 shrink-0" />
                  <span>Atenção: Não use o &quot;URL público&quot;. Use o &quot;Endereço secreto&quot;.</span>
                </div>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0624C7] text-xs font-bold text-white">
                3
              </span>
              <div className="flex-1 text-xs">
                <p className="font-semibold text-foreground">Cole o link copiado no campo abaixo</p>
                <p className="text-muted-foreground mt-0.5">
                  Cole a URL aqui no CRM e clique em <strong>Salvar e Conectar</strong>. Se você colar por engano com
                  aspas ou código, nós limpamos automaticamente!
                </p>
              </div>
            </div>
          </div>

          {/* Campo de Input Real */}
          <div className="space-y-2 pt-1">
            <Label htmlFor="ical-url-input" className="text-xs font-semibold text-foreground">
              Cole aqui o seu Endereço Secreto iCal:
            </Label>
            <div className="relative">
              <Link2 className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="ical-url-input"
                type="text"
                value={icalInput}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                className="pl-9 pr-3 text-xs font-mono bg-background border-border/80 focus:border-[#0624C7]"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Formato esperado: termina com <code className="text-foreground">/basic.ics</code>.
            </p>
          </div>

          {/* Seção Avançada Opcional (Service Account) */}
          <div className="border-t border-border/40 pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-200"
            >
              {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              <span>Configuração para desenvolvedores (Google Cloud Service Account)</span>
            </button>

            {showAdvanced && (
              <div className="mt-2.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5">
                <p>
                  Caso sua conta do Google Cloud esteja sem pendências, você pode configurar as credenciais no{' '}
                  <code className="text-primary font-mono">.env.local</code>:
                </p>
                <pre className="text-[10px] font-mono bg-background/90 p-2 rounded border border-border/50 text-foreground overflow-x-auto">
                  {'GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL="bot@..."\nGOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."'}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-border/40 pt-3">
            <Button variant="outline" size="sm" onClick={() => setConnectOpen(false)} className="cursor-pointer">
              Fechar
            </Button>

            <Button
              size="sm"
              onClick={handleSaveIcal}
              disabled={savingIcal || !icalInput.trim()}
              className="bg-[#0624C7] text-white hover:bg-[#0624C7]/90 cursor-pointer gap-1.5 font-medium shadow-sm transition-all duration-200"
            >
              {savingIcal ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Validando com o Google...
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  Salvar e Conectar Agenda
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* Modal: Testar Disponibilidade da IA no WhatsApp                     */}
      {/* =================================================================== */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-5 text-[#FCE026]" />
              Simular Consulta de Disponibilidade da IA
            </DialogTitle>
            <DialogDescription>
              Veja exatamente quais horários o agente de IA irá sugerir ao cliente no WhatsApp para o dia escolhido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-foreground">Selecione uma data para testar:</Label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-[#0624C7] focus:outline-none"
                />
                <Button
                  onClick={runAvailabilityTest}
                  disabled={testing}
                  className="bg-[#0624C7] text-white hover:bg-[#0624C7]/90 cursor-pointer"
                >
                  {testing ? <RefreshCw className="size-4 animate-spin" /> : 'Consultar'}
                </Button>
              </div>
            </div>

            {testResult && (
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Resultado da Consulta:</span>
                  <span
                    className={testResult.isWorkingDay ? 'text-emerald-500 font-medium' : 'text-amber-500 font-medium'}
                  >
                    {testResult.isWorkingDay ? 'Dia de Atendimento' : 'Dia Fechado'}
                  </span>
                </div>

                <div className="rounded-lg bg-muted/30 p-3 border border-border/40 text-xs">
                  <p className="font-medium text-muted-foreground mb-1">Como a IA responde no WhatsApp:</p>
                  <p className="text-foreground italic">
                    &ldquo;
                    {testResult.formattedWhatsApp
                      ? `Consultei a nossa agenda aqui: temos horários livres ${testResult.formattedWhatsApp}. Qual desses fica melhor para você?`
                      : testResult.replyText || 'Sem horários disponíveis.'}
                    &rdquo;
                  </p>
                </div>

                {Boolean(testResult.availableSlots && testResult.availableSlots.length > 0) && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                      Todos os slots livres ({testResult.availableSlots?.length} horários):
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                      {testResult.availableSlots?.map((s) => {
                        const isSuggested = testResult.suggestedSlots?.includes(s.time);
                        return (
                          <span
                            key={s.time}
                            className={`rounded px-2 py-0.5 text-xs font-mono border ${
                              isSuggested
                                ? 'bg-[#0624C7]/15 text-[#0624C7] dark:text-blue-300 border-[#0624C7]/30 font-semibold'
                                : 'bg-background text-muted-foreground border-border/50'
                            }`}
                          >
                            {s.time} {isSuggested && '★'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)} className="cursor-pointer">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
