// Regras puras da checagem de fotos antes do render. A parte que olha a
// imagem (escura/borrada) fica em worker/photo-vision.ts.

export const MIN_SHORT_SIDE = 720;

export function checkResolution(dims: Array<{ width: number; height: number }>): string[] {
  const messages: string[] = [];
  dims.forEach((d, i) => {
    if (Math.min(d.width, d.height) < MIN_SHORT_SIDE) {
      messages.push(`A foto ${i + 1} está pequena demais (mínimo ${MIN_SHORT_SIDE} px no lado menor)`);
    }
  });
  return messages;
}
