import { isBrMobile, normalizeBrPhone } from './phone';
import { scoreLead } from './score';

export interface ScraperPlace {
  title?: string;
  category?: string;
  address?: string;
  complete_address?: unknown;
  phone?: string;
  website?: string;
  review_rating?: number | string | null;
  review_count?: number | string | null;
  place_id?: string;
  link?: string;
  emails?: string[] | null;
  [key: string]: unknown;
}

export interface LeadInsert {
  account_id: string;
  search_id: string;
  place_id: string | null;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  is_mobile: boolean;
  website: string | null;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  maps_url: string | null;
  raw: ScraperPlace;
  score: number;
  score_reasons: string[];
}

export function parseScraperOutput(text: string): ScraperPlace[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  }
  const out: ScraperPlace[] = [];
  for (const line of trimmed.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // The scraper can flush a partial last line when killed; skip it.
    }
  }
  return out;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

export function mapPlaceToLead(
  place: ScraperPlace,
  ctx: { accountId: string; searchId: string },
): LeadInsert {
  const phone = normalizeBrPhone(str(place.phone));
  const isMobile = isBrMobile(phone);
  const website = str(place.website);
  const rating = num(place.review_rating);
  const reviewCount = num(place.review_count);
  const { score, reasons } = scoreLead({ website, rating, reviewCount, isMobile });
  const email = Array.isArray(place.emails) ? str(place.emails[0]) : null;

  return {
    account_id: ctx.accountId,
    search_id: ctx.searchId,
    place_id: str(place.place_id),
    name: str(place.title) ?? 'Sem nome',
    category: str(place.category),
    address: str(place.address),
    phone,
    is_mobile: isMobile,
    website,
    email,
    rating: rating === null ? null : Math.round(rating * 10) / 10,
    review_count: reviewCount === null ? null : Math.round(reviewCount),
    maps_url: str(place.link),
    raw: place,
    score,
    score_reasons: reasons,
  };
}
