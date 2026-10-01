export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotoLike = { name: string; type: string; size: number; lastModified: number };

const sameFile = (a: PhotoLike, b: PhotoLike) =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

// Photos are added a few at a time (phone galleries rarely allow multi-select),
// so new picks append instead of replacing what is already there.
export function mergePhotos<T extends PhotoLike>(current: T[], picked: T[]): { photos: T[]; error: string | null } {
  const rejected = picked.filter((f) => !PHOTO_TYPES.includes(f.type) || f.size > MAX_PHOTO_BYTES);
  const fresh = picked.filter((f) => !rejected.includes(f) && !current.some((c) => sameFile(c, f)));
  const all = [...current, ...fresh];
  const photos = all.slice(0, MAX_PHOTOS);
  let error: string | null = null;
  if (rejected.length) error = `Use JPG, PNG ou WebP de até 5 MB: ${rejected.map((f) => f.name).join(', ')}`;
  else if (all.length > MAX_PHOTOS) error = `No máximo ${MAX_PHOTOS} fotos: ficaram as ${MAX_PHOTOS} primeiras`;
  return { photos, error };
}
