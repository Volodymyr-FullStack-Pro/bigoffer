import { SpeedInsights } from '@vercel/speed-insights/next';
import Script from 'next/script';

/**
 * Real-user speed (Vercel Speed Insights) and click/scroll heatmaps (Microsoft Clarity). Production only; Clarity
 * loads only when NEXT_PUBLIC_CLARITY_ID is set. Text inside the app is masked (see the app layout): Clarity sees
 * where people click and scroll, never a CV, a letter or a recruiter message.
 */
export function SiteAnalytics() {
  if (process.env.NODE_ENV !== 'production') return null;
  const clarity = process.env.NEXT_PUBLIC_CLARITY_ID;
  return (
    <>
      <SpeedInsights />
      {clarity && /^[a-z0-9]+$/i.test(clarity) && (
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity}");`}
        </Script>
      )}
    </>
  );
}
