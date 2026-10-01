'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Crown,
  Download,
  Film,
  Loader2,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Tv,
  Wand2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { buildMediaPath } from '@/lib/storage/upload-media';
import { hasStalePending } from '@/lib/jobs/stale';
import { pathsToSign, type SignedEntry } from '@/lib/marketing/signed-urls';
import { DAILY_VIDEO_LIMIT, getStartOfTodayIso, isDailyLimitReached } from '@/lib/marketing/limits';
import type { MarketingVideo, VideoFormat, VideoTone } from '@/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { PhotoPicker } from './photo-picker';
import { VideoProgress } from './video-progress';
import { SocialModal } from './social-modal';

const BUCKET = 'marketing';
const FORMAT_OPTIONS: { value: VideoFormat; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'vertical', label: 'Vertical (9:16)', icon: Smartphone },
  { value: 'square', label: 'Quadrado (1:1)', icon: Square },
  { value: 'landscape', label: 'Horizontal (16:9)', icon: Tv },
];

const TONE_OPTIONS: { value: VideoTone; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'default', label: 'Leve e divertido', icon: Sparkles },
  { value: 'polished', label: 'Elegante', icon: Crown },
  { value: 'app-store', label: 'Estilo anúncio', icon: Tag },
  { value: 'cinematic', label: 'Cinematográfico', icon: Film },
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
  const [publishVideo, setPublishVideo] = useState<MarketingVideo | null>(null);

  const [now, setNow] = useState(() => Date.now());

  const startOfToday = useMemo(() => getStartOfTodayIso(), []);
  const videosCountToday = useMemo(() => {
    return videos.filter((v) => v.created_at >= startOfToday).length;
  }, [videos, startOfToday]);
  const limitReached = isDailyLimitReached(videosCountToday);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setSubmitting(true);
    const imagePaths: string[] = [];
    try {
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
      // Don't leave orphan uploads in Storage when the request didn't go through.
      if (imagePaths.length) await supabase.storage.from(BUCKET).remove(imagePaths);
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

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border/70 bg-card/50 p-5 shadow-xs backdrop-blur-xs transition-all">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="video-prompt" className="font-medium text-foreground">
              Briefing e copy do vídeo <span className="text-muted-foreground font-normal">(opcional ao usar fotos)</span>:
            </label>
            <span className="font-mono text-muted-foreground">{prompt.length}/1000</span>
          </div>
          <textarea
            id="video-prompt"
            className="min-h-24 w-full rounded-xl border border-border/80 bg-background/80 p-3 text-sm transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            placeholder="Descreva a oferta ou o objetivo do vídeo. Ex: Promoção de corte + barba por R$ 50 nesta sexta na Barbearia do Alemão, Santos. Vagas limitadas no WhatsApp."
            value={prompt}
            maxLength={1000}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <PhotoPicker files={files} onChange={setFiles} disabled={!canEdit || submitting} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <span className="text-xs font-medium text-foreground">Formato do vídeo:</span>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMAT_OPTIONS.map((f) => {
                const Icon = f.icon;
                const selected = format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFormat(f.value)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs transition-all cursor-pointer ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary font-medium shadow-xs'
                        : 'border-border/70 bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] truncate max-w-full">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-foreground">Tom de voz:</span>
            <div className="grid grid-cols-2 gap-1.5">
              {TONE_OPTIONS.map((t) => {
                const Icon = t.icon;
                const selected = tone === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTone(t.value)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-all cursor-pointer ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary font-medium shadow-xs'
                        : 'border-border/70 bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
          <Button
            type="submit"
            disabled={!canEdit || submitting || limitReached || (!prompt.trim() && files.length === 0)}
            className="cursor-pointer gap-2 font-medium shadow-xs transition-all"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Gerar vídeo com IA
          </Button>

          <span className="rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground">
            Vídeos hoje:{' '}
            <strong className={limitReached ? 'text-destructive' : 'text-foreground'}>
              {videosCountToday}/{DAILY_VIDEO_LIMIT}
            </strong>
            {limitReached && ' (limite atingido)'}
          </span>
        </div>
      </form>


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <div key={v.id} className="space-y-2 rounded-lg border p-3">
            {v.status === 'done' && urls[v.id]?.video ? (
              <video className="w-full rounded" src={urls[v.id].video} poster={urls[v.id].poster} controls preload="none" />
            ) : v.status === 'failed' ? (
              <div className="flex aspect-video items-center justify-center rounded bg-destructive/10 text-destructive text-sm font-medium">
                Falha na geração
              </div>
            ) : (
              <VideoProgress status={v.status} startedAt={v.started_at} createdAt={v.created_at} />
            )}
            <p className="line-clamp-2 text-sm">{v.prompt || 'Vídeo feito só com as fotos'}</p>
            {v.status === 'failed' && <p className="text-xs text-destructive line-clamp-3">{v.error}</p>}
            <div className="flex flex-wrap gap-2">
              {v.status === 'done' && v.video_path && (
                <>
                  <a
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    href={`/api/marketing/videos/${v.id}/download`}
                  >
                    <Download className="mr-1 h-4 w-4" />Baixar
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPublishVideo(v)}
                  >
                    <Share2 className="mr-1 h-4 w-4" />Publicar
                  </Button>
                </>
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

      {publishVideo && (
        <SocialModal
          video={publishVideo}
          videoUrl={urls[publishVideo.id]?.video}
          posterUrl={urls[publishVideo.id]?.poster}
          open={Boolean(publishVideo)}
          onOpenChange={(open) => !open && setPublishVideo(null)}
        />
      )}
    </div>
  );
}

