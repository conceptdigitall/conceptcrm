# Arquitetura — CRM Concept (wacrm)

## Componentes

1. **Frontend / API (Next.js App Router):** interface web hospedada na Vercel, server actions e rotas REST.
2. **Banco de Dados (Supabase / PostgreSQL):** persistência principal, RLS para multi-tenant por conta, migrations versionadas.
3. **Worker em Segundo Plano (Node.js):** processo persistente gerenciando sessões de WhatsApp, filas e agentes de IA.
4. **Vercel:** plataforma de deploy contínuo da aplicação web.

## Fluxo de Dados

```
WhatsApp Webhook / Baileys
           │
           ▼
     worker/ (Node.js) ──► processamento, IA, classificação
           │
           ▼
   Supabase (PostgreSQL) ◄── Server Actions / Next.js API
           ▲
           │
      Frontend Web (Vercel)
```

- Mensagens chegam via worker, são persistidas no Supabase e disparam eventos em tempo real para a interface web.
- Ações do operador na interface web geram comandos que o worker consome ou consulta diretamente no banco.
