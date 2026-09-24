'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { toast } from 'sonner';
import type { Appointment, AppointmentStatus, Contact } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Plus,
  Search,
  MoreHorizontal,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Phone,
  LayoutGrid,
  List,
  AlertCircle,
  Copy,
  CalendarCheck,
  CalendarX,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';

type ViewMode = 'table' | 'cards';
type TimeFilter = 'all' | 'this_week' | 'upcoming' | 'past';

export default function AppointmentsPage() {
  const supabase = createClient();
  const { account } = useAuth();
  const canManage = useCan('send-messages');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Form states
  const [formContactId, setFormContactId] = useState('');
  const [formTitle, setFormTitle] = useState('Sessão de Diagnóstico & Demonstração');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formDuration, setFormDuration] = useState('30');
  const [formStatus, setFormStatus] = useState<AppointmentStatus>('confirmed');
  const [formMeetingUrl, setFormMeetingUrl] = useState('https://meet.google.com/new');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Load appointments and contacts
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setTableMissing(false);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          contact_id,
          account_id,
          user_id,
          title,
          scheduled_at,
          duration_minutes,
          status,
          meeting_url,
          notes,
          created_at,
          updated_at,
          contact:contacts(id, name, phone, email, avatar_url)
        `)
        .order('scheduled_at', { ascending: true });

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
          setTableMissing(true);
        } else {
          console.error('[appointments fetch error]:', error);
          toast.error('Erro ao carregar agendamentos.');
        }
        setAppointments([]);
      } else {
        // PostgREST returns contact as object or null
        const mapped = (data || []).map((row) => ({
          ...row,
          contact: Array.isArray(row.contact) ? row.contact[0] : row.contact,
        })) as Appointment[];
        setAppointments(mapped);
      }
    } catch (err) {
      console.error('[appointments fetch catch]:', err);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const fetchContacts = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, email, avatar_url')
        .order('name', { ascending: true })
        .limit(100);

      if (data) setContacts(data as Contact[]);
    } catch (err) {
      console.error('[contacts fetch for appointments]:', err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchAppointments();
    fetchContacts();
  }, [fetchAppointments, fetchContacts]);

  // Open create modal with sensible defaults
  const handleOpenCreate = () => {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    // Format YYYY-MM-DDTHH:mm for datetime-local
    const offset = nextHour.getTimezoneOffset() * 60000;
    const localIso = new Date(nextHour.getTime() - offset).toISOString().slice(0, 16);

    setFormContactId(contacts[0]?.id || '');
    setFormTitle('Sessão de Diagnóstico & Demonstração');
    setFormScheduledAt(localIso);
    setFormDuration('30');
    setFormStatus('confirmed');
    setFormMeetingUrl('https://meet.google.com/new');
    setFormNotes('');
    setCreateOpen(true);
  };

  const handleOpenEdit = (appt: Appointment) => {
    setSelectedAppointment(appt);
    setFormContactId(appt.contact_id || '');
    setFormTitle(appt.title || 'Sessão de Diagnóstico & Demonstração');

    const dt = new Date(appt.scheduled_at);
    const offset = dt.getTimezoneOffset() * 60000;
    const localIso = new Date(dt.getTime() - offset).toISOString().slice(0, 16);

    setFormScheduledAt(localIso);
    setFormDuration(String(appt.duration_minutes || 30));
    setFormStatus(appt.status || 'confirmed');
    setFormMeetingUrl(appt.meeting_url || 'https://meet.google.com/new');
    setFormNotes(appt.notes || '');
    setEditOpen(true);
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContactId) {
      toast.error('Selecione um contato para o agendamento.');
      return;
    }
    if (!formScheduledAt) {
      toast.error('Informe a data e horário da reunião.');
      return;
    }

    setSaving(true);
    try {
      const scheduledIso = new Date(formScheduledAt).toISOString();
      const payload: Record<string, unknown> = {
        contact_id: formContactId,
        title: formTitle.trim() || 'Sessão de Diagnóstico & Demonstração',
        scheduled_at: scheduledIso,
        duration_minutes: parseInt(formDuration, 10) || 30,
        status: formStatus,
        meeting_url: formMeetingUrl.trim() || 'https://meet.google.com/new',
        notes: formNotes.trim() || null,
      };

      if (account?.id) {
        payload.account_id = account.id;
      }

      const { error } = await supabase.from('appointments').insert(payload);

      if (error) {
        console.error('[insert appointment error]:', error);
        toast.error(`Erro ao criar agendamento: ${error.message}`);
      } else {
        toast.success('Agendamento criado com sucesso!');
        setCreateOpen(false);
        fetchAppointments();
      }
    } catch (err) {
      console.error('[save appointment catch]:', err);
      toast.error('Falha ao salvar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    setSaving(true);
    try {
      const scheduledIso = new Date(formScheduledAt).toISOString();
      const { error } = await supabase
        .from('appointments')
        .update({
          contact_id: formContactId || null,
          title: formTitle.trim() || 'Sessão de Diagnóstico & Demonstração',
          scheduled_at: scheduledIso,
          duration_minutes: parseInt(formDuration, 10) || 30,
          status: formStatus,
          meeting_url: formMeetingUrl.trim() || 'https://meet.google.com/new',
          notes: formNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedAppointment.id);

      if (error) {
        toast.error(`Erro ao atualizar: ${error.message}`);
      } else {
        toast.success('Agendamento atualizado!');
        setEditOpen(false);
        fetchAppointments();
      }
    } catch (err) {
      console.error('[edit appointment catch]:', err);
      toast.error('Falha ao atualizar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: AppointmentStatus) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        toast.error('Erro ao alterar status.');
      } else {
        toast.success(`Status alterado para ${statusLabels[status]}.`);
        fetchAppointments();
      }
    } catch (err) {
      console.error('[update status catch]:', err);
      toast.error('Falha ao alterar status.');
    }
  };

  const handleDelete = async () => {
    if (!selectedAppointment) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', selectedAppointment.id);

      if (error) {
        toast.error(`Erro ao excluir: ${error.message}`);
      } else {
        toast.success('Agendamento excluído.');
        setDeleteOpen(false);
        fetchAppointments();
      }
    } catch (err) {
      console.error('[delete appointment catch]:', err);
      toast.error('Falha ao excluir agendamento.');
    } finally {
      setSaving(false);
    }
  };

  // Filter calculations
  const filteredAppointments = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const dayOfWeek = (now.getDay() + 6) % 7; // Monday-first
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return appointments.filter((appt) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && appt.status !== statusFilter) return false;

      // 2. Time Filter
      const apptDate = new Date(appt.scheduled_at);
      if (timeFilter === 'this_week') {
        if (apptDate < startOfWeek || apptDate >= endOfWeek) return false;
      } else if (timeFilter === 'upcoming') {
        if (apptDate < now) return false;
      } else if (timeFilter === 'past') {
        if (apptDate >= now) return false;
      }

      // 3. Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const contactName = appt.contact?.name?.toLowerCase() || '';
        const contactPhone = appt.contact?.phone || '';
        const title = appt.title.toLowerCase();
        const notes = appt.notes?.toLowerCase() || '';

        return (
          contactName.includes(q) ||
          contactPhone.includes(q) ||
          title.includes(q) ||
          notes.includes(q)
        );
      }

      return true;
    });
  }, [appointments, statusFilter, timeFilter, search]);

  const metricsSummary = useMemo(() => {
    const total = appointments.length;
    const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
    const completed = appointments.filter((a) => a.status === 'completed').length;
    const cancelled = appointments.filter((a) => a.status === 'cancelled').length;
    return { total, confirmed, completed, cancelled };
  }, [appointments]);

  const copySqlCode = () => {
    const sql = `CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Sessão de Diagnóstico & Demonstração',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  meeting_url TEXT DEFAULT 'https://meet.google.com/new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);`;
    navigator.clipboard.writeText(sql);
    toast.success('SQL copiado para a área de transferência!');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner if Database Table is not yet migrated */}
      {tableMissing && (
        <div className="rounded-xl border border-[#FCE026]/40 bg-[#FCE026]/10 p-5 text-foreground shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-[#FCE026]" />
              <div>
                <h4 className="text-sm font-semibold">Tabela de Agendamentos Pendente no Supabase</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  A tabela <code className="rounded bg-background/80 px-1 py-0.5 text-primary">appointments</code> ainda não foi criada no banco de dados. Execute o script da migration no SQL Editor do seu projeto Supabase.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copySqlCode}
                className="gap-2 border-[#FCE026]/50 bg-background/80 hover:bg-[#FCE026]/20"
              >
                <Copy className="size-3.5" />
                Copiar SQL
              </Button>
              <Button
                size="sm"
                onClick={fetchAppointments}
                className="bg-[#0624C7] text-white hover:bg-[#0624C7]/90"
              >
                Verificar Novamente
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header section with Concept Digital Aesthetics */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#0624C7]/10 text-[#0624C7]">
              <CalendarIcon className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Agendamentos</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sessões de diagnóstico e demonstrações agendadas pelo agente de IA no WhatsApp ou pela equipe.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleOpenCreate}
            disabled={!canManage}
            className="gap-2 bg-[#0624C7] font-medium text-white shadow-sm transition-all hover:bg-[#0624C7]/90 active:scale-98"
          >
            <Plus className="size-4" />
            Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Metric badges strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 transition-colors">
          <p className="text-xs font-medium text-muted-foreground">Total de Reuniões</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{metricsSummary.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Confirmadas</p>
            <span className="size-2 rounded-full bg-[#0624C7]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#0624C7]">{metricsSummary.confirmed}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Concluídas</p>
            <span className="size-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-500">{metricsSummary.completed}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Canceladas</p>
            <span className="size-2 rounded-full bg-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-bold text-muted-foreground">{metricsSummary.cancelled}</p>
        </div>
      </div>

      {/* Filter and search toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search box */}
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por contato, telefone ou título..."
              className="pl-9"
            />
          </div>

          {/* Time Filter Pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTimeFilter('all')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                timeFilter === 'all'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('this_week')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                timeFilter === 'this_week'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('upcoming')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                timeFilter === 'upcoming'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Próximos
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('past')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                timeFilter === 'past'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Passados
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {/* Status selector */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | AppointmentStatus)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="all">Todos os Status</option>
              <option value="confirmed">Confirmados</option>
              <option value="completed">Concluídos</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="Visualização em tabela"
              className={`rounded p-1.5 transition-colors ${
                viewMode === 'table' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
              }`}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              aria-label="Visualização em cards"
              className={`rounded p-1.5 transition-colors ${
                viewMode === 'cards' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
              }`}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card">
          <div className="size-8 animate-spin rounded-full border-2 border-[#0624C7] border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando agendamentos...</p>
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#0624C7]/10 text-[#0624C7]">
            <CalendarIcon className="size-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {search || statusFilter !== 'all' || timeFilter !== 'all'
              ? 'Nenhum agendamento encontrado'
              : 'Nenhuma reunião agendada ainda'}
          </h3>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            {search || statusFilter !== 'all' || timeFilter !== 'all'
              ? 'Tente ajustar os filtros ou os termos de pesquisa acima.'
              : 'Quando um cliente agendar pelo WhatsApp com a IA ou você criar manualmente, a sessão aparecerá aqui com link direto para o Google Meet.'}
          </p>
          <div className="mt-5">
            <Button
              onClick={handleOpenCreate}
              className="gap-2 bg-[#0624C7] text-white hover:bg-[#0624C7]/90"
            >
              <Plus className="size-4" />
              Criar Agendamento Manual
            </Button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-64">Contato</TableHead>
                <TableHead>Título & Detalhes</TableHead>
                <TableHead className="w-56">Data e Horário</TableHead>
                <TableHead className="w-28">Duração</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-48 text-right">Ação / Reunião</TableHead>
                <TableHead className="w-12 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAppointments.map((appt) => {
                const contact = appt.contact;
                const contactInitial = (contact?.name?.[0] || contact?.phone?.[0] || 'L').toUpperCase();
                const scheduledDate = new Date(appt.scheduled_at);
                const isPast = scheduledDate < new Date();

                return (
                  <TableRow key={appt.id} className="border-border hover:bg-muted/40 transition-colors">
                    {/* Contact cell */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 border border-border">
                          {contact?.avatar_url ? (
                            <AvatarImage src={contact.avatar_url} alt={contact.name || ''} />
                          ) : null}
                          <AvatarFallback className="bg-[#0624C7]/10 text-xs font-semibold text-[#0624C7]">
                            {contactInitial}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {contact?.name || 'Lead sem nome'}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="size-3" />
                            <span>{contact?.phone || 'Sem telefone'}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Title & Notes cell */}
                    <TableCell>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{appt.title}</p>
                        {appt.notes ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={appt.notes}>
                            {appt.notes}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>

                    {/* Date/Time cell */}
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <CalendarIcon className="size-4 shrink-0 text-[#0624C7]" />
                        <span className="font-medium">
                          {formatDateTimeBR(scheduledDate)}
                        </span>
                      </div>
                      {isPast && appt.status === 'confirmed' ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                          Horário já transcorrido
                        </span>
                      ) : null}
                    </TableCell>

                    {/* Duration cell */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        <span>{appt.duration_minutes || 30} min</span>
                      </div>
                    </TableCell>

                    {/* Status cell */}
                    <TableCell>
                      <StatusBadge status={appt.status} />
                    </TableCell>

                    {/* Join Meeting button */}
                    <TableCell className="text-right">
                      {appt.meeting_url ? (
                        <a
                          href={appt.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#0624C7]/20 bg-[#0624C7] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0624C7]/90 active:scale-98"
                        >
                          <Video className="size-3.5" />
                          <span>Entrar na Reunião</span>
                          <ExternalLink className="size-3 opacity-80" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem link</span>
                      )}
                    </TableCell>

                    {/* Actions dropdown */}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Ações do agendamento"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {appt.contact?.id && (
                            <DropdownMenuItem
                              render={
                                <Link
                                  href={`/inbox?contactId=${appt.contact.id}`}
                                  className="flex items-center gap-2"
                                />
                              }
                            >
                              <MessageSquare className="size-4 text-primary" />
                              Abrir conversa no Chat
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleUpdateStatus(appt.id, 'completed')}
                            disabled={appt.status === 'completed'}
                          >
                            <CheckCircle2 className="size-4 text-emerald-500" />
                            Marcar como Concluída
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleUpdateStatus(appt.id, 'cancelled')}
                            disabled={appt.status === 'cancelled'}
                          >
                            <XCircle className="size-4 text-rose-500" />
                            Cancelar Reunião
                          </DropdownMenuItem>
                          {appt.status !== 'confirmed' && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateStatus(appt.id, 'confirmed')}
                            >
                              <CalendarCheck className="size-4 text-[#0624C7]" />
                              Reativar / Confirmar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenEdit(appt)}>
                            <Pencil className="size-4" />
                            Editar Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedAppointment(appt);
                              setDeleteOpen(true);
                            }}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAppointments.map((appt) => {
            const contact = appt.contact;
            const contactInitial = (contact?.name?.[0] || contact?.phone?.[0] || 'L').toUpperCase();
            const scheduledDate = new Date(appt.scheduled_at);

            return (
              <div
                key={appt.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-[#0624C7]/40 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-10 border border-border">
                        {contact?.avatar_url ? (
                          <AvatarImage src={contact.avatar_url} alt={contact.name || ''} />
                        ) : null}
                        <AvatarFallback className="bg-[#0624C7]/10 text-sm font-semibold text-[#0624C7]">
                          {contactInitial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {contact?.name || 'Lead sem nome'}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="size-3" />
                          <span>{contact?.phone || 'Sem telefone'}</span>
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={appt.status} />
                  </div>

                  <div className="mt-4 border-t border-border pt-3">
                    <h4 className="text-sm font-medium text-foreground">{appt.title}</h4>
                    {appt.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{appt.notes}</p>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="size-3.5 text-[#0624C7]" />
                      <span className="font-medium text-foreground">
                        {formatDateTimeBR(scheduledDate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="size-3" />
                      <span>{appt.duration_minutes || 30} min</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                  {appt.meeting_url ? (
                    <a
                      href={appt.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0624C7] py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0624C7]/90 active:scale-98"
                    >
                      <Video className="size-3.5" />
                      <span>Entrar na Reunião</span>
                      <ExternalLink className="size-3 opacity-80" />
                    </a>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Mais opções"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleUpdateStatus(appt.id, 'completed')}>
                        <CheckCircle2 className="size-4 text-emerald-500" />
                        Concluir Reunião
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdateStatus(appt.id, 'cancelled')}>
                        <XCircle className="size-4 text-rose-500" />
                        Cancelar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleOpenEdit(appt)}>
                        <Pencil className="size-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedAppointment(appt);
                          setDeleteOpen(true);
                        }}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSaveCreate}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <CalendarIcon className="size-5 text-[#0624C7]" />
                Novo Agendamento Manual
              </DialogTitle>
              <DialogDescription>
                Agende uma sessão com o lead inserindo os detalhes da chamada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Contact Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Contato *
                </label>
                <select
                  value={formContactId}
                  onChange={(e) => setFormContactId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-[#0624C7]"
                  required
                >
                  <option value="">Selecione um contato existente...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ? `${c.name} (${c.phone})` : c.phone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Título da Reunião *
                </label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Sessão de Diagnóstico & Demonstração"
                  required
                />
              </div>

              {/* Date/Time and Duration */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Data e Horário *
                  </label>
                  <Input
                    type="datetime-local"
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Duração
                  </label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-[#0624C7]"
                  >
                    <option value="15">15 minutos</option>
                    <option value="20">20 minutos (Padrão IA)</option>
                    <option value="30">30 minutos</option>
                    <option value="45">45 minutos</option>
                    <option value="60">60 minutos (1 hora)</option>
                  </select>
                </div>
              </div>

              {/* Meeting URL */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Link do Google Meet / Reunião
                </label>
                <div className="relative">
                  <Video className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={formMeetingUrl}
                    onChange={(e) => setFormMeetingUrl(e.target.value)}
                    placeholder="https://meet.google.com/new"
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Observações / Contexto
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex: Lead interessado no pacote integrado LP + CRM + Tráfego."
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-[#0624C7]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#0624C7] text-white hover:bg-[#0624C7]/90"
              >
                {saving ? 'Salvando...' : 'Salvar Agendamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT MODAL */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <Pencil className="size-5 text-[#0624C7]" />
                Editar Agendamento
              </DialogTitle>
              <DialogDescription>
                Atualize as informações, status ou horário da reunião.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Contact */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Contato
                </label>
                <select
                  value={formContactId}
                  onChange={(e) => setFormContactId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-[#0624C7]"
                >
                  <option value="">Selecione o contato...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ? `${c.name} (${c.phone})` : c.phone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Título da Reunião
                </label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Sessão de Diagnóstico & Demonstração"
                  required
                />
              </div>

              {/* Date/Time and Duration */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Data e Horário
                  </label>
                  <Input
                    type="datetime-local"
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as AppointmentStatus)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-[#0624C7]"
                  >
                    <option value="confirmed">Confirmada</option>
                    <option value="completed">Concluída</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>
              </div>

              {/* Meeting URL */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Link da Reunião
                </label>
                <Input
                  value={formMeetingUrl}
                  onChange={(e) => setFormMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/new"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Observações
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-[#0624C7]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#0624C7] text-white hover:bg-[#0624C7]/90"
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              Excluir Agendamento
            </DialogTitle>
            <DialogDescription>
              Tem certeza de que deseja excluir este agendamento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          {selectedAppointment && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-semibold text-foreground">{selectedAppointment.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Contato: {selectedAppointment.contact?.name || selectedAppointment.contact?.phone || 'Não identificado'}
              </p>
              <p className="text-xs text-muted-foreground">
                Horário: {formatDateTimeBR(new Date(selectedAppointment.scheduled_at))}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? 'Excluindo...' : 'Sim, Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------
// Helpers & Components
// ------------------------------------------------------------

const statusLabels: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

function StatusBadge({ status }: { status: AppointmentStatus }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0624C7]/30 bg-[#0624C7]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0624C7]">
        <span className="size-1.5 rounded-full bg-[#0624C7]" />
        Confirmada
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Concluída
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <CalendarX className="size-3" />
      Cancelada
    </span>
  );
}

function formatDateTimeBR(date: Date): string {
  if (isNaN(date.getTime())) return 'Data inválida';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
