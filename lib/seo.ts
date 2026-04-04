export function getSiteUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;

  if (!envUrl) {
    return 'https://extconvert.vercel.app';
  }

  const normalized = envUrl.startsWith('http') ? envUrl : `https://${envUrl}`;
  return normalized.replace(/\/$/, '');
}
