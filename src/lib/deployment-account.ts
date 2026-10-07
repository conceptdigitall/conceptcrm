// Vários deploys do CRM (Concept, Imports, Limpa Mais) dividem o mesmo
// projeto Supabase, uma conta (`accounts`) por loja. As rotas que usam a
// chave de serviço (que ignora o RLS) e o WhatsApp deste deploy
// (EVOLUTION_INSTANCE_NAME) precisam ficar presas à conta deste deploy;
// senão o robô grava a conversa na conta errada e a fila de automações
// de uma loja sai pelo número de outra.
//
// CRM_ACCOUNT_ID = id da conta deste deploy (select id from accounts).

// O CRM da Concept existia sozinho no banco: sem CRM_ACCOUNT_ID, segue o modo
// antigo (primeira whatsapp_config, filas de todas as contas) para a produção
// não parar antes da variável estar na Vercel. Nos CRMs de clientes é true.
export const REQUIRE_DEPLOYMENT_ACCOUNT = false

export class MissingDeploymentAccountError extends Error {
  constructor() {
    super('CRM_ACCOUNT_ID não definido: este CRM divide o banco com outras contas e não sabe qual é a dele.')
    this.name = 'MissingDeploymentAccountError'
  }
}

/** Id da conta deste deploy, ou null se a variável estiver vazia. */
export function deploymentAccountId(
  raw: string | undefined = process.env.CRM_ACCOUNT_ID,
): string | null {
  const id = (raw ?? '').trim()
  return id || null
}

/**
 * Conta a que as rotas de servidor deste deploy devem se limitar.
 * Devolve null só quando a regra permite rodar sem conta (modo antigo,
 * banco de uma conta só); com REQUIRE_DEPLOYMENT_ACCOUNT, lança erro.
 */
export function deploymentAccountScope(
  raw: string | undefined = process.env.CRM_ACCOUNT_ID,
  required: boolean = REQUIRE_DEPLOYMENT_ACCOUNT,
): string | null {
  const id = deploymentAccountId(raw)
  if (!id && required) throw new MissingDeploymentAccountError()
  return id
}
