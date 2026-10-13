'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Download, ExternalLink, Share2 } from 'lucide-react';
import type { MarketingVideo } from '@/types';
import { generateSocialCaption, getSocialShareLinks } from '@/lib/marketing/social';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SocialModalProps {
  video: MarketingVideo;
  videoUrl?: string;
  posterUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SocialModal({
  video,
  videoUrl,
  posterUrl,
  open,
  onOpenChange,
}: SocialModalProps) {
  // Vídeos feitos por pacote já trazem a legenda escrita pelo diretor.
  const [caption, setCaption] = useState(
    () => video.caption ?? generateSocialCaption({ prompt: video.prompt, tone: video.tone }).caption,
  );
  const [copied, setCopied] = useState(false);

  const links = getSocialShareLinks(caption);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      toast.success('Legenda copiada para a área de transferência!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar automaticamente');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Publicar nas redes sociais
          </DialogTitle>
          <DialogDescription>
            Como as redes exigem login da sua conta: baixe o arquivo .mp4, copie a legenda sugerida e cole direto no painel da rede desejada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {videoUrl && (
            <div className="overflow-hidden rounded-md border bg-black/50">
              <video
                src={videoUrl}
                poster={posterUrl}
                controls
                preload="metadata"
                className="max-h-48 w-full object-contain"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Legenda e hashtags sugeridas:</span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado!' : 'Copiar legenda'}
              </button>
            </div>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background p-2.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              className={buttonVariants({ size: 'sm', variant: 'default', className: 'gap-1.5' })}
              href={`/api/marketing/videos/${video.id}/download`}
            >
              <Download className="h-4 w-4" />
              Baixar vídeo .mp4
            </a>
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Legenda copiada' : 'Copiar legenda'}
            </Button>
          </div>

          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Abrir painel da rede social:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <a
                href={links.metaBusiness}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border bg-muted/30 p-2.5 hover:bg-muted/70 transition-colors"
              >
                <span className="font-medium">Instagram / Facebook</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href={links.tiktok}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border bg-muted/30 p-2.5 hover:bg-muted/70 transition-colors"
              >
                <span className="font-medium">TikTok Studio</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href={links.linkedin}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border bg-muted/30 p-2.5 hover:bg-muted/70 transition-colors"
              >
                <span className="font-medium">LinkedIn</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href={links.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border bg-muted/30 p-2.5 hover:bg-muted/70 transition-colors"
              >
                <span className="font-medium">WhatsApp Web</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
