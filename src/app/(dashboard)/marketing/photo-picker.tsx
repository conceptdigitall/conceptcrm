'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, UploadCloud, X } from 'lucide-react';
import { MAX_PHOTOS, PHOTO_TYPES, mergePhotos } from '@/lib/marketing/photos';

export function PhotoPicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function add(list: FileList | null | File[]) {
    const incoming = Array.isArray(list) ? list : Array.from(list ?? []);
    const { photos, error } = mergePhotos(files, incoming);
    if (error) toast.error(error);
    onChange(photos);
    if (input.current) input.current.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (disabled || files.length >= MAX_PHOTOS) return;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || files.length >= MAX_PHOTOS) return;
    if (e.dataTransfer.files) {
      add(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">Fotos do negócio:</span>
        <span className="text-muted-foreground font-mono">
          {files.length}/{MAX_PHOTOS} fotos selecionadas
        </span>
      </div>

      {files.length === 0 ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              input.current?.click();
            }
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-primary bg-primary/10 scale-[0.99]'
              : 'border-border/70 hover:border-primary/50 hover:bg-muted/30 bg-muted/10'
          } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Arraste fotos ou <span className="text-primary underline-offset-2 hover:underline">clique para selecionar</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Até 4 fotos em JPG, PNG ou WebP (máx. 5 MB cada). Com fotos, a descrição é opcional.
            </p>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-wrap items-center gap-2.5 rounded-xl border p-2.5 transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/10'
          }`}
        >
          {files.map((f, i) => (
            <div
              key={`${f.name}-${f.lastModified}`}
              className="group relative h-22 w-22 overflow-hidden rounded-lg border border-border/80 bg-background shadow-xs transition-transform hover:scale-[1.02]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
              <button
                type="button"
                aria-label={`Remover ${f.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white shadow-xs transition-colors hover:bg-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="absolute bottom-1 left-1 max-w-[80%] truncate text-[9px] text-white/90 font-mono px-1 rounded bg-black/40">
                {f.name}
              </span>
            </div>
          ))}

          {files.length < MAX_PHOTOS && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => input.current?.click()}
              className="flex h-22 w-22 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 text-muted-foreground transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary cursor-pointer disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[11px] font-medium">Adicionar</span>
            </button>
          )}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        multiple
        hidden
        onChange={(e) => add(e.target.files)}
      />
    </div>
  );
}
