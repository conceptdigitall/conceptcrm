'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, RefreshCw, TrendingUp } from 'lucide-react';
import type {
  MarketingReference,
  Playbook,
  ReferenceEixo,
  ReferencePlatform,
  BusinessNiche,
} from '@/types';
import { BUSINESS_NICHES } from '@/lib/marketing/niche-autopilot';
import { EIXO_LABEL, fileExtension, referenceStatusLabel, shouldPoll } from '@/lib/marketing/reference-view';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const POLL_MS = 10_000;
const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const STATUS_STYLE: Record<MarketingReference['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-500/10 text-emerald-600',
  failed: 'bg-destructive/10 text-destructive',
};

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return (data && typeof data.error === 'string' && data.error) || fallback;
}

export function ReferencesTab() {
  const [references, setReferences] = useState<MarketingReference[]>([]);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [eixo, setEixo] = useState<ReferenceEixo>('como_falar');
  const [nicho, setNicho] = useState<BusinessNiche>('geral');
  const [views, setViews] = useState('');
  const [plataforma, setPlataforma] = useState<ReferencePlatform | ''>('');
  const [busy, setBusy] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/references');
      if (!res.ok) return;
      const data = await res.json();
      setReferences(data.references || []);
      setPlaybook(data.playbook ?? null);
    } catch {
      // Falha de rede: mantém o que já está na tela.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const polling = shouldPoll(references);
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, load]);

  function meta() {
    return {
      eixo,
      nicho: eixo === 'sobre_o_que' ? nicho : undefined,
      views: views.trim() || undefined,
    };
  }

  function afterSend(reference: MarketingReference, duplicate: boolean) {
    if (duplicate) {
      toast.info('Esta referência já estava na lista.');
    } else {
      toast.success('Referência enviada. A análise começa em instantes.');
    }
    setReferences((prev) => [reference, ...prev.filter((r) => r.id !== reference.id)]);
  }

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      toast.error('Cole o link do vídeo.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/marketing/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), ...meta() }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Não foi possível enviar o link.'));
      const data = await res.json();
      afterSend(data.reference, Boolean(data.duplicate));
      setUrl('');
      setViews('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar o link.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    if (!plataforma) {
      toast.error('Escolha a plataforma do vídeo (Instagram ou TikTok) antes de enviar o arquivo.');
      return;
    }
    setBusy(true);
    try {
      const common = { plataforma, ...meta() };
      const prep = await fetch('/api/marketing/references/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...common,
          fileType: file.type,
          fileSize: file.size,
          ext: fileExtension(file.name) || undefined,
        }),
      });
      if (!prep.ok) throw new Error(await readError(prep, 'Não foi possível preparar o envio.'));
      const { id, path, token } = await prep.json();

      const { error: upErr } = await createClient().storage.from('marketing').uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error('O envio do vídeo falhou. Confira a conexão e tente de novo.');

      const done = await fetch('/api/marketing/references/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, path, ...common }),
      });
      if (!done.ok) throw new Error(await readError(done, 'O vídeo foi enviado, mas não foi registrado.'));
      const data = await done.json();
      afterSend(data.reference, Boolean(data.duplicate));
      setViews('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/marketing/references/${id}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Não foi possível analisar de novo.'));
      toast.success('Análise reiniciada.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível analisar de novo.');
    } finally {
      setRetryingId(null);
    }
  }

  const playbookHasContent =
    playbook && (playbook.comoFalar.length || playbook.sobreOQue.length || playbook.evitar.length);

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSendLink} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-foreground font-heading">Referências</h2>
          <p className="text-sm text-muted-foreground">
            Envie o link de um vídeo que performou bem (ou o arquivo). A IA analisa por que funcionou e como adaptar.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium md:col-span-2">
            Link do vídeo
            <Input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              className="h-10"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            O que você quer aprender com ele
            <select value={eixo} onChange={(e) => setEixo(e.target.value as ReferenceEixo)} className={SELECT_CLASS}>
              <option value="como_falar">{EIXO_LABEL.como_falar}</option>
              <option value="sobre_o_que">{EIXO_LABEL.sobre_o_que}</option>
            </select>
          </label>

          {eixo === 'sobre_o_que' && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nicho
              <select value={nicho} onChange={(e) => setNicho(e.target.value as BusinessNiche)} className={SELECT_CLASS}>
                {BUSINESS_NICHES.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Visualizações (opcional)
            <Input
              inputMode="numeric"
              value={views}
              onChange={(e) => setViews(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex.: 250000"
              className="h-10"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Button
            type="submit"
            disabled={busy}
            className="h-11 gap-2 rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary-hover"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Enviando...' : 'Enviar link'}
          </Button>

          <div className="flex flex-1 flex-col gap-1.5 border-t border-border pt-3 sm:flex-row sm:items-end sm:gap-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <label className="flex flex-col gap-1.5 text-sm font-medium sm:w-44">
              Plataforma do arquivo
              <select
                value={plataforma}
                onChange={(e) => setPlataforma(e.target.value as ReferencePlatform | '')}
                className={SELECT_CLASS}
              >
                <option value="">Escolha...</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
              </select>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="h-11 gap-2 rounded-xl"
            >
              <Upload className="h-4 w-4" />
              Enviar arquivo
            </Button>
          </div>
        </div>
      </form>

      {playbookHasContent && playbook && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground font-heading">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendências da semana
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <PlaybookList title="Como falar" items={playbook.comoFalar} />
            <PlaybookList title="Sobre o que" items={playbook.sobreOQue} />
            <PlaybookList title="Evitar" items={playbook.evitar} />
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Carregando referências...
        </div>
      ) : references.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="font-medium text-foreground">Nenhuma referência ainda.</p>
          <p className="mt-1 text-sm text-muted-foreground">Cole um link acima para começar.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {references.map((r) => (
            <ReferenceCard key={r.id} reference={r} retrying={retryingId === r.id} onRetry={() => handleRetry(r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaybookList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function ReferenceCard({
  reference: r,
  retrying,
  onRetry,
}: {
  reference: MarketingReference;
  retrying: boolean;
  onRetry: () => void;
}) {
  const a = r.analise;
  const nichoLabel = r.nicho ? BUSINESS_NICHES.find((n) => n.value === r.nicho)?.label : null;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-semibold text-primary hover:underline"
          >
            {r.url}
          </a>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.plataforma === 'instagram' ? 'Instagram' : 'TikTok'} · {EIXO_LABEL[r.eixo]}
            {nichoLabel ? ` · ${nichoLabel}` : ''}
            {r.views != null ? ` · ${r.views.toLocaleString('pt-BR')} views` : ''}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
          {referenceStatusLabel(r.status)}
        </span>
      </div>

      {r.status === 'failed' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {r.error && <p className="text-sm text-destructive">{r.error}</p>}
          <Button type="button" variant="outline" disabled={retrying} onClick={onRetry} className="h-10 gap-2 rounded-xl">
            <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
            Analisar de novo
          </Button>
        </div>
      )}

      {r.status === 'done' && a && (
        <div className="flex flex-col gap-3 border-t border-border pt-3 text-sm">
          <p className="font-semibold text-foreground">{a.tema}</p>
          {a.porQueViralizou.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Por que funcionou
              </span>
              <ul className="list-disc pl-4 text-muted-foreground">
                {a.porQueViralizou.slice(0, 3).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como adaptar</span>
            <p className="text-muted-foreground">{a.comoAdaptar}</p>
          </div>
        </div>
      )}
    </li>
  );
}
