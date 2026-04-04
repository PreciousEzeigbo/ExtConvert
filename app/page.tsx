import type { Metadata } from 'next';

import { HomeClient } from '@/components/home-client';
import { getSiteUrl } from '@/lib/seo';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'ExtConvert | Fast File Conversion Tool',
  description:
    'Convert documents and images in batches with ExtConvert. Supported conversions include PDF, DOCX, TXT, PNG, JPG, and WEBP formats.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ExtConvert | Fast File Conversion Tool',
    description:
      'Convert documents and images in batches with ExtConvert. Supported conversions include PDF, DOCX, TXT, PNG, JPG, and WEBP formats.',
    url: siteUrl,
    siteName: 'ExtConvert',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ExtConvert | Fast File Conversion Tool',
    description:
      'Convert documents and images in batches with ExtConvert. Supported conversions include PDF, DOCX, TXT, PNG, JPG, and WEBP formats.',
  },
};

export const revalidate = 3600;

export default function Home() {
  const currentYear = new Date().getFullYear();

  const webAppJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'ExtConvert',
    url: siteUrl,
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Web',
    description:
      'Batch file conversion web app for converting between PDF, DOCX, TXT, PNG, JPG, and WEBP formats.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <HomeClient currentYear={currentYear} />
    </>
  );
}
