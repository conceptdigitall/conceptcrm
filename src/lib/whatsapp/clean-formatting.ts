/**
 * Utilitário para limpar formatações de negrito markdown e asteriscos das respostas da IA.
 * 
 * Remove negrito com asteriscos duplos (**texto** -> texto),
 * asteriscos simples (*texto* -> texto) e quaisquer asteriscos remanescentes,
 * garantindo mensagens 100% limpas, fluidas e naturais para o WhatsApp.
 */
export function cleanReplyFormatting(text: string): string {
  if (!text) return '';
  return text
    // Remove negrito markdown com asteriscos duplos: **texto** -> texto
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
    // Remove negrito/itálico com asteriscos simples: *texto* -> texto
    .replace(/\*([\s\S]*?)\*/g, '$1')
    // Remove quaisquer asteriscos remanescentes soltos
    .replace(/\*/g, '')
    .trim();
}
