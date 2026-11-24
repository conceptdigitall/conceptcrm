'use client';

import { FinanceDashboard } from '@/components/finance/finance-dashboard';
import { useAuth } from '@/hooks/use-auth';
import { isFinanceAccount } from '@/lib/finance-accounts';

export default function FinanceiroPage() {
  const { account } = useAuth();
  if (account && !isFinanceAccount(account.id)) {
    return <p className="text-sm text-muted-foreground">Esta conta não tem o módulo Financeiro.</p>;
  }
  return <FinanceDashboard />;
}
