import type { VideoTone } from '@/types';

export interface SocialCaptionResult {
  caption: string;
  hashtags: string[];
}

export function generateSocialCaption({
  prompt,
  tone = 'default',
}: {
  prompt: string;
  tone?: VideoTone;
}): SocialCaptionResult {
  const cleanPrompt = prompt.trim();

  let body = '';
  if (cleanPrompt) {
    body = `${cleanPrompt}\n\nEntre em contato diretamente pelo WhatsApp para saber mais e garantir o seu atendimento!`;
  } else {
    body = `Confira os detalhes e novidades que preparamos especialmente para você! ✨\n\nFicou com alguma dúvida ou quer agendar? Nos mande uma mensagem no WhatsApp.`;
  }

  const hashtags = [
    '#novidades',
    '#marketingdigital',
    '#negocioslocais',
    '#conceptdigital',
    tone === 'cinematic' ? '#qualidade' : '#atendimento',
  ];

  const caption = `${body}\n\n${hashtags.join(' ')}`;

  return {
    caption,
    hashtags,
  };
}

export function getSocialShareLinks(caption: string): {
  metaBusiness: string;
  tiktok: string;
  linkedin: string;
  whatsapp: string;
} {
  const encoded = encodeURIComponent(caption);
  return {
    metaBusiness: 'https://business.facebook.com/latest/composer',
    tiktok: 'https://www.tiktok.com/creator-center/upload',
    linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${encoded}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encoded}`,
  };
}
