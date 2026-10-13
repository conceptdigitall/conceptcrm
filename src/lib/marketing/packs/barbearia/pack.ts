import type { Pack, TemplateSpec } from '../types';
import compilado from './templates/compilado/template.json';
import antesDepois from './templates/antes-depois/template.json';
import oferta from './templates/oferta/template.json';

export const barbeariaPack: Pack = {
  niche: 'barbearia',
  name: 'Barbearia',
  tone: 'polished',
  hashtags: ['#barbearia', '#barbeiro', '#corte', '#barba', '#degrade'],
  templates: [compilado, antesDepois, oferta] as TemplateSpec[],
  buttons: [
    {
      id: 'compilado',
      label: 'Compilado de cortes',
      description: 'Mostre os melhores cortes e acabamentos da sua barbearia em um vídeo só.',
      templateId: 'compilado',
      formId: 'highlight',
      directorHint:
        'Destaque o acabamento e a técnica dos cortes (degradê, barba, navalha). Tom seguro e masculino, direto, sem gírias exageradas. Não invente preços nem promoções.',
    },
    {
      id: 'antes-depois',
      label: 'Antes e depois',
      description: 'Envie as fotos em pares (antes, depois) e mostre a transformação.',
      templateId: 'antes-depois',
      formId: 'highlight',
      directorHint:
        'Foque na transformação: o antes e o depois do cliente. As fotos vêm em pares consecutivos (antes, depois) e devem ser mantidas nessa ordem relativa. Não invente preços nem promoções.',
    },
    {
      id: 'oferta',
      label: 'Oferta da semana',
      description: 'Divulgue uma promoção com preço e prazo para encher a agenda.',
      templateId: 'oferta',
      formId: 'discount',
      directorHint:
        'Crie urgência com o preço e o prazo informados, usando exatamente os valores do dono. Chamada para ação para agendar pelo WhatsApp.',
    },
  ],
};
