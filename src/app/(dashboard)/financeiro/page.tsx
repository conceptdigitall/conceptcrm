import { Metadata } from 'next';
import { FinanceView } from '@/components/finance/finance-view';

export const metadata: Metadata = {
  title: 'Financeiro | Concept CRM',
  description: 'Receitas, despesas, cobranças de contratos e relatórios da Concept Digital',
};

export default function FinanceiroPage() {
  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Financeiro</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Receitas, despesas, cobranças dos contratos e painel do Simples Nacional
        </p>
      </div>
      <FinanceView />
    </div>
  );
}
