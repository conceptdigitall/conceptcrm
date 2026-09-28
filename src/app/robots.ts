import type { MetadataRoute } from 'next';

/** O CRM é interno (dados de clientes): nenhum buscador deve indexar. */
export default function robots(): MetadataRoute.Robots {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
}
