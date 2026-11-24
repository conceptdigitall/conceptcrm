export type ContractType = 'recorrente' | 'avulso';

export type ContractStatus = 'rascunho' | 'enviado' | 'assinado' | 'cancelado';

export interface ClientContract {
  id: string;
  account_id: string;
  contact_id: string;
  user_id: string | null;
  title: string;
  type: ContractType;
  status: ContractStatus;
  setup_price: number;
  monthly_price: number;
  billing_day: number | null;
  document_url: string | null;
  signed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractWithContact extends ClientContract {
  contact?: {
    id: string;
    name: string | null;
    company: string | null;
    phone: string;
    email: string | null;
  } | null;
}

export interface ContractFormData {
  title: string;
  type: ContractType;
  status: ContractStatus;
  setup_price: number;
  monthly_price: number;
  billing_day?: number | null;
  document_url?: string;
  notes?: string;
}
