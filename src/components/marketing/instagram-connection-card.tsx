'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Link2, Unlink } from 'lucide-react';
import type { InstagramConnectionStatus } from '@/lib/marketing/instagram-connection';
import { Button } from '@/components/ui/button';

// Conecta o Instagram da própria empresa. O token vai uma vez para o
// servidor, que confere na Meta e guarda cifrado; a tela nunca o recebe de volta.
export function InstagramConnectionCard() {
  const [status, setStatus] = useState<InstagramConnectionStatus | null>(null);
  const [igUserId, setIgUserId] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/marketing/instagram/connection')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d?.connection ?? null))
      .catch(() => setStatus(null));
  }, []);

  async function send(method: 'PUT' | 'DELETE') {
    setBusy(true);
    try {
      const res = await fetch('/api/marketing/instagram/connection', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'PUT' ? JSON.stringify({ ig_user_id: igUserId, access_token: token }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(res.status === 403 ? 'Só administradores da conta podem conectar o Instagram.' : data.error || 'Falha ao salvar');
      }
      setStatus(data.connection);
      setToken('');
      toast.success(method === 'PUT' ? 'Instagram conectado!' : 'Instagram desconectado.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Link2 className="w-4 h-4 text-primary" />
        <span className="text-xs uppercase font-bold text-foreground">Instagram da sua empresa</span>
      </div>

      {status?.connected ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span>
              Conectado{status.username ? <> como <b>@{status.username}</b></> : null}
            </span>
          </div>
          {status.last_error && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Última publicação falhou: {status.last_error} Se o token venceu, conecte de novo.</span>
            </div>
          )}
          <Button variant="outline" disabled={busy} onClick={() => send('DELETE')} className="gap-2 h-9 rounded-lg text-xs">
            <Unlink className="w-3.5 h-3.5" /> Desconectar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Os posts são publicados no Instagram conectado aqui. Precisa ser conta profissional ligada a uma página do Facebook.
        </p>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send('PUT');
        }}
      >
        <label className="text-xs font-semibold text-muted-foreground">ID da conta do Instagram</label>
        <input
          inputMode="numeric"
          value={igUserId}
          onChange={(e) => setIgUserId(e.target.value.replace(/\D/g, ''))}
          placeholder={status?.ig_user_id ?? '17841400000000000'}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
        />
        <label className="text-xs font-semibold text-muted-foreground">Token de acesso da Meta</label>
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={status?.connected ? 'Cole um novo token para trocar' : 'EAAG…'}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
        />
        <Button type="submit" disabled={busy || !igUserId || !token} className="h-9 rounded-lg text-xs font-bold">
          {busy ? 'Conferindo com a Meta…' : status?.connected ? 'Trocar conexão' : 'Conectar Instagram'}
        </Button>
      </form>
    </div>
  );
}
