'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Download, Loader2, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { buildMediaPath } from '@/lib/storage/upload-media';
import { hasStalePending } from '@/lib/jobs/stale';
import { pathsToSign, type SignedEntry } from '@/lib/marketing/signed-urls';
import type { MarketingVideo, VideoFormat, VideoTone } from '@/types';
import { Button } from '@/components/ui/button';

const BUCKET = 'marketing';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TONES: { value: VideoTone; label: string }[] = [
  { value: 'default', label: 'Leve e divertido' },
  { value: 'polished', label: 'Elegante' },
  { value: 'app-store', label: 'Limpo, estilo anúncio' },
  { value: 'cinematic', label: 'Cinematográfico' },
];
const FORMATS: { value: VideoFormat; label: string }[] = [
  { value: 'vertical', label: 'Vertical (Stories/Reels)' },
  { value: 'square', label: 'Quadrado (Feed)' },
  { value: 'landscape', label: 'Horizontal (YouTube)' },
];
const JOB_LABEL = { pending: 'Na fila', running: 'Gerando…', done: 'Pronto', failed: 'Erro' } as const;

export default function MarketingPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId } = useAuth();
  const canEdit = useCan('send-messages');

  const [videos, setVideos] = useState<MarketingVideo[]>([]);
  const [urls, setUrls] = useState<Record<string, { video?: string; poster?: string }>>({});
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<VideoFormat>('vertical');
  const [tone, setTone] = useState<VideoTone>('default');
  const [submitting, setSubmitting] = useState(false);

  const [now, setNow] = useState(() => Date.now());

  // Reused across polls: a new token changes <video src> and restarts playback.
  const signedCache = useRef(new Map<string, SignedEntry>());

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('marketing_videos').select('*').order('created_at', { ascending: false }).limit(50);
    const rows = (data ?? []) as MarketingVideo[];
    const cache = signedCache.current;
    const now = Date.now();
    const toSign = pathsToSign(rows, cache, now);
    if (toSign.length > 0) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(toSign, 3600);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) cache.set(s.path, { url: s.signedUrl, signedAt: now });
      }
    }
    const signedUrls = Object.fromEntries(rows.map((v) => [v.id, {
      video: v.video_path ? cache.get(v.video_path)?.url : undefined,
      poster: v.poster_path ? cache.get(v.poster_path)?.url : undefined,
    }]));
    return { rows, signedUrls };
  }, [supabase]);

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchData>>) => {
    setVideos(d.rows);
    setUrls(d.signedUrls);
    setNow(Date.now());
  }, []);

  const load = useCallback(() => {
    if (!accountId) return;
    fetchData().then(apply);
  }, [fetchData, apply, accountId]);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    fetchData().then((d) => {
      if (active) apply(d);
    });
    return () => {
      active = false;
    };
  }, [fetchData, apply, accountId]);

  const busy = videos.some((v) => v.status === 'pending' || v.status === 'running');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const bad = picked.find((f) => !IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE_BYTES);
    if (bad) return toast.error(`${bad.name}: use JPG, PNG ou WebP de até 5 MB`);
    if (picked.length > 4) return toast.error('No máximo 4 fotos');
    setFiles(picked);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setSubmitting(true);
    try {
      const imagePaths: string[] = [];
      for (const file of files) {
        const path = buildMediaPath(accountId, file.name, Date.now(), 'uploads');
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (error) throw new Error(`Falha ao enviar ${file.name}: ${error.message}`);
        imagePaths.push(path);
      }
      const res = await fetch('/api/marketing/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imagePaths, format, tone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível criar o vídeo');
      toast.success('Vídeo na fila. Leva alguns minutos com o worker rodando.');
      setPrompt('');
      setFiles([]);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  async function retry(id: string) {
    const res = await fetch(`/api/marketing/videos/${id}/retry`, { method: 'POST' });
    if (!res.ok) return toast.error('Não foi possível tentar de novo');
    load();
  }

  async function remove(v: MarketingVideo) {
    if (!confirm('Excluir este vídeo?')) return;
    const paths = [...v.image_paths, v.video_path, v.poster_path].filter((p): p is string => Boolean(p));
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from('marketing_videos').delete().eq('id', v.id);
    if (error) return toast.error(error.message);
    setVideos((prev) => prev.filter((x) => x.id !== v.id));
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Marketing</h1>
        <p className="text-sm text-muted-foreground">Vídeos curtos (15–25 s) gerados com IA a partir de um texto e suas fotos.</p>
      </div>

      {hasStalePending(videos, now) && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4" />
          Há vídeos na fila há mais de 10 minutos. O worker está rodando? (veja docs/worker.md)
        </div>
      )}

      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
        <textarea
          className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
          placeholder="Ex: Promoção de corte + barba por R$ 50 nesta sexta, Barbearia do Alemão, Santos."
          value={prompt} maxLength={1000} required
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input type="file" accept={IMAGE_TYPES.join(',')} multiple onChange={(e) => pickFiles(e.target.files)} />
          <select className="h-9 rounded-md border bg-background px-2" value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)}>
            {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-2" value={tone} onChange={(e) => setTone(e.target.value as VideoTone)}>
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Button type="submit" disabled={!canEdit || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Gerar vídeo
          </Button>
        </div>
        {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((f) => f.name).join(', ')}</p>}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <div key={v.id} className="space-y-2 rounded-lg border p-3">
            {v.status === 'done' && urls[v.id]?.video ? (
              <video className="w-full rounded" src={urls[v.id].video} poster={urls[v.id].poster} controls preload="none" />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded bg-muted text-sm">
                {JOB_LABEL[v.status]}
              </div>
            )}
            <p className="line-clamp-2 text-sm">{v.prompt}</p>
            {v.status === 'failed' && <p className="text-xs text-destructive line-clamp-3">{v.error}</p>}
            <div className="flex gap-2">
              {v.status === 'done' && urls[v.id]?.video && (
                <a className="text-sm underline" href={urls[v.id].video} download>
                  <Download className="mr-1 inline h-4 w-4" />Baixar
                </a>
              )}
              {v.status === 'failed' && (
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => retry(v.id)}>
                  <RotateCcw className="mr-1 h-4 w-4" />Tentar de novo
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={!canEdit || v.status === 'running'} onClick={() => remove(v)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
