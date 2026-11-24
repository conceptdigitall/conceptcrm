import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { FinanceDashboard } from '@/components/finance/finance-dashboard';
import { isLocalFinanceMode } from '@/lib/finance/context';

// Painel Financeiro sem login, para testar na própria máquina com
// FINANCE_STORAGE=local. Em produção (ou sem a variável) responde 404.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Financeiro (local)',
  robots: { index: false, follow: false, nocache: true },
};

export default function FinanceiroLocalPage() {
  if (!isLocalFinanceMode()) notFound();
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <p className="mb-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Modo local: os dados ficam em <code>.data/financeiro.json</code> nesta máquina, sem login.
      </p>
      <FinanceDashboard />
    </main>
  );
}
