-- Última mensagem de cada conversa (quem mandou e quando).
-- Usada pela aba Contatos para marcar leads "esfriando": a última mensagem
-- foi nossa e o cliente não respondeu há dias.
-- security_invoker: a view respeita o RLS de messages do usuário que consulta,
-- então cada conta só enxerga as próprias conversas.

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

create or replace view public.conversation_last_message
with (security_invoker = true) as
select distinct on (m.conversation_id)
  m.conversation_id,
  m.sender_type,
  m.created_at
from public.messages m
order by m.conversation_id, m.created_at desc;

grant select on public.conversation_last_message to authenticated, service_role;
