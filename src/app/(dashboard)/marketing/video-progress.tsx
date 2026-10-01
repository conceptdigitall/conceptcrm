'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { formatElapsed, getStatusPhrase } from '@/lib/marketing/progress';

interface VideoProgressProps {
  status: 'pending' | 'running' | 'done';
  startedAt?: string | null;
  createdAt: string;
}

export function VideoProgress({ status, startedAt, createdAt }: VideoProgressProps) {
  const startTime = startedAt ? new Date(startedAt).getTime() : new Date(createdAt).getTime();

  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startTime) / 1000)));

  useEffect(() => {
    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const phrase = status === 'running'
    ? getStatusPhrase(elapsed)
    : status === 'done'
    ? 'Preparando visualização do vídeo…'
    : 'Aguardando o worker pegar o pedido na fila…';

  return (
    <div className="flex aspect-video flex-col items-center justify-center rounded-md bg-muted/60 p-4 text-center">
      <div className="mb-2 flex items-center gap-2">
        {status === 'running' || status === 'done' ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <Clock className="h-5 w-5 animate-pulse text-muted-foreground" />
        )}
        <span className="font-medium text-sm">
          {status === 'running' ? 'Gerando vídeo…' : status === 'done' ? 'Pronto' : 'Na fila'}
        </span>
        <span className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs text-muted-foreground shadow-xs">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <p className="min-h-5 text-xs text-muted-foreground transition-all duration-300">
        {phrase}
      </p>

      <span className="mt-2 text-[10px] text-muted-foreground/70">
        Tempo estimado: 2 a 3 minutos no Mac
      </span>
    </div>
  );
}
