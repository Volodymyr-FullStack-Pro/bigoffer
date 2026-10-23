'use client';

import { Bookmark, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

/**
 * Save a job from any site: a browser extension (one click on its button) or a bookmark to drag to the bookmarks bar.
 * Both open the board with the page's address; the board reads it and offers the card. No logins or tokens involved.
 */
export function SaveButtonSection() {
  const t = useTranslations('saveButton');
  const bookmarklet = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // React refuses javascript: links in markup, so the bookmark's address is set here, for this site's own domain.
    const board = `${window.location.origin}/board`;
    bookmarklet.current?.setAttribute(
      'href',
      `javascript:location.href='${board}?add='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title.slice(0,200))`,
    );
  }, []);
  return (
    <section data-testid="save-button" className="brutal flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-xl font-bold">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('intro')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('extTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('extSteps')}</p>
          <a href="/bigoffer-extension.zip" download data-testid="extension-download" className="btn brutal-press inline-flex items-center gap-2 self-start bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
            <Download aria-hidden className="size-4" />
            {t('extDownload')}
          </a>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('bmTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('bmSteps')}</p>
          <a ref={bookmarklet} href="#" data-testid="bookmarklet" onClick={(e) => e.preventDefault()} className="inline-flex cursor-grab items-center gap-2 self-start rounded-xl border border-dashed border-brand px-4 py-2 text-sm font-semibold">
            <Bookmark aria-hidden className="size-4 text-brand" />
            {t('bmLabel')}
          </a>
        </div>
      </div>
    </section>
  );
}
