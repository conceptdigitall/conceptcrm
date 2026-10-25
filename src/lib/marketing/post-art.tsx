// Desenho da arte do post (Satori via next/og): só flexbox e posição absoluta.
// Três layouts na paleta Concept, escolhidos de forma estável pelo id do post.
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { ART_SIZE, headlineSize, type ArtContent, type ArtFormat } from '@/lib/marketing/post-art-content';

const NIGHT = '#04081E';
const NAVY = '#0624C7';
const YELLOW = '#FCE026';
const WHITE = '#FFFFFF';

type FontSpec = { name: string; data: ArrayBuffer; weight: 500 | 800; style: 'normal' };

// Montserrat é a fonte de título do CRM. Sem User-Agent o Google devolve TTF,
// que o Satori lê. Se a rede falhar, a arte sai na fonte padrão do next/og.
let fontsPromise: Promise<FontSpec[]> | null = null;

async function loadFont(weight: 500 | 800): Promise<FontSpec | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Montserrat:wght@${weight}`).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const data = await fetch(url).then((r) => r.arrayBuffer());
    return { name: 'Montserrat', data, weight, style: 'normal' };
  } catch {
    return null;
  }
}

function loadFonts(): Promise<FontSpec[]> {
  fontsPromise ??= Promise.all([loadFont(500), loadFont(800)]).then((list) => {
    const ok = list.filter((f): f is FontSpec => f !== null);
    if (ok.length < 2) fontsPromise = null; // tenta de novo na próxima arte
    return ok;
  });
  return fontsPromise;
}

function Footer({ c, dark }: { c: ArtContent; dark: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          padding: '22px 40px',
          borderRadius: 999,
          background: dark ? YELLOW : NAVY,
          color: dark ? NIGHT : WHITE,
          fontSize: 34,
          fontWeight: 800,
        }}
      >
        {c.cta}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', color: dark ? WHITE : NIGHT }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 800 }}>{c.brand}</div>
        <div style={{ display: 'flex', fontSize: 26, opacity: 0.7 }}>{c.handle}</div>
      </div>
    </div>
  );
}

function Tag({ text, dark }: { text: string; dark: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignSelf: 'flex-start',
        padding: '12px 26px',
        borderRadius: 999,
        border: `3px solid ${dark ? YELLOW : NAVY}`,
        color: dark ? YELLOW : NAVY,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: 3,
        textTransform: 'uppercase',
      }}
    >
      {text}
    </div>
  );
}

/** Layout 0: fundo navy com brilho, chamada branca e traço amarelo. */
function Impact({ c, format }: { c: ArtContent; format: ArtFormat }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', width: '100%', height: '100%', padding: 88, background: `linear-gradient(160deg, ${NAVY} 0%, ${NIGHT} 78%)`, color: WHITE }}>
      <div style={{ display: 'flex', position: 'absolute', top: -260, right: -260, width: 720, height: 720, borderRadius: 999, background: YELLOW, opacity: 0.14 }} />
      <div style={{ display: 'flex', position: 'absolute', bottom: -180, right: -120, width: 420, height: 420, borderRadius: 999, border: `4px solid ${YELLOW}`, opacity: 0.2 }} />
      <Tag text={c.tag} dark />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div style={{ display: 'flex', fontSize: headlineSize(c.headline, format), fontWeight: 800, lineHeight: 1.08, letterSpacing: -2 }}>{c.headline}</div>
        <div style={{ display: 'flex', width: 160, height: 14, borderRadius: 999, background: YELLOW }} />
        {c.support && <div style={{ display: 'flex', fontSize: 38, fontWeight: 500, lineHeight: 1.35, opacity: 0.85 }}>{c.support}</div>}
      </div>
      <Footer c={c} dark />
    </div>
  );
}

/** Layout 1: fundo amarelo com cartão branco arredondado. */
function Card({ c, format }: { c: ArtContent; format: ArtFormat }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: 72, background: YELLOW, color: NIGHT, gap: 48 }}>
      <Tag text={c.tag} dark={false} />
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 36, padding: 72, borderRadius: 56, background: WHITE, boxShadow: '0 30px 60px rgba(4,8,30,0.18)' }}>
        <div style={{ display: 'flex', fontSize: headlineSize(c.headline, format), fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, color: NAVY }}>{c.headline}</div>
        {c.support && <div style={{ display: 'flex', fontSize: 38, fontWeight: 500, lineHeight: 1.35, color: '#3A4366' }}>{c.support}</div>}
      </div>
      <Footer c={c} dark={false} />
    </div>
  );
}

/** Layout 2: editorial escuro com aspas e faixa lateral amarela. */
function Editorial({ c, format }: { c: ArtContent; format: ArtFormat }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: NIGHT, color: WHITE }}>
      <div style={{ display: 'flex', width: 28, height: '100%', background: YELLOW }} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1, padding: 88 }}>
        <Tag text={c.tag} dark />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ display: 'flex', fontSize: 220, fontWeight: 800, lineHeight: 0.8, color: YELLOW }}>“</div>
          <div style={{ display: 'flex', fontSize: headlineSize(c.headline, format), fontWeight: 800, lineHeight: 1.08, letterSpacing: -2 }}>{c.headline}</div>
          {c.support && <div style={{ display: 'flex', fontSize: 38, fontWeight: 500, lineHeight: 1.35, color: '#AEB8E8' }}>{c.support}</div>}
        </div>
        <Footer c={c} dark />
      </div>
    </div>
  );
}

const LAYOUTS = [Impact, Card, Editorial] as const;

export async function renderPostArt(c: ArtContent, format: ArtFormat, headers?: Record<string, string>): Promise<ImageResponse> {
  const Layout = LAYOUTS[c.layout];
  const fonts = await loadFonts();
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', fontFamily: fonts.length ? 'Montserrat' : undefined }}>
        <Layout c={c} format={format} />
      </div>
    ),
    { ...ART_SIZE[format], fonts, headers },
  );
}

/** JPEG da arte: a Graph API do Instagram só aceita JPEG para foto. */
export async function renderPostArtJpeg(c: ArtContent, format: ArtFormat): Promise<Buffer> {
  const png = Buffer.from(await (await renderPostArt(c, format)).arrayBuffer());
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
