'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A window of the app: dots, an address bar, the screen. */
export function AppFrame({ url, children, className = '' }: { url: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_120px_-40px_rgb(0_0_0/0.65),0_0_0_1px_rgb(115_247_178/0.06)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto rounded-md bg-muted px-3 py-0.5 font-mono text-[11px] text-muted-foreground">{url}</span>
      </div>
      {children}
    </div>
  );
}

/** The hero's product window leans back in 3D and straightens as the page scrolls toward it. */
export function TiltIn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    if (reduced()) {
      const id = requestAnimationFrame(() => setP(1));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    const on = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Fully leaning back at the top of the page, flat after about two thirds of a screen of scrolling.
        setP(Math.min(1, window.scrollY / (window.innerHeight * 0.65)));
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  const e = 1 - (1 - p) ** 3;
  return (
    <div ref={ref} style={{ perspective: '1600px' }}>
      <div style={{ transform: `translateY(${(1 - e) * 70}px) rotateX(${(1 - e) * 38}deg) scale(${0.78 + e * 0.22})`, transformOrigin: '50% 0%', opacity: 0.55 + e * 0.45, transition: 'transform 60ms linear, opacity 60ms linear' }}>{children}</div>
    </div>
  );
}

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (reduced()) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setShown(true), io.disconnect()), { rootMargin: '0px 0px -12% 0px' });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(24px)', transition: `opacity 700ms ease ${delay}ms, transform 700ms cubic-bezier(.2,.7,.2,1) ${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** A number that counts up once it scrolls into view. */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced()) {
      const id = requestAnimationFrame(() => setN(value));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / 1400);
        setN(Math.round(value * (1 - (1 - k) ** 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={ref} className={className}>
      {n}
    </span>
  );
}

/**
 * Scroll story: steps on the left along a line that fills with mint as you scroll, each number lighting up when the
 * line reaches it; one sticky app window on the right whose screen changes with the step in the middle of the screen.
 * On a phone each step shows its own screen under it.
 */
export function StickyStory({ steps }: { steps: { title: string; text: string; url: string; screen: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const [fill, setFill] = useState(0);
  const list = useRef<HTMLOListElement>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const el of refs.current) if (el) io.observe(el);
    let frame = 0;
    const on = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = list.current?.getBoundingClientRect();
        if (!box) return;
        // How far the middle of the screen has travelled down the list.
        setFill(Math.min(1, Math.max(0, (window.innerHeight / 2 - box.top) / box.height)));
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', on);
    };
  }, []);
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-14">
      <ol ref={list} className="relative flex flex-col pl-14">
        <span aria-hidden className="absolute top-0 bottom-0 left-[1.1rem] w-0.5 rounded-full bg-border" />
        <span aria-hidden className="absolute top-0 left-[1.1rem] w-0.5 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" style={{ height: `${fill * 100}%` }} />
        {steps.map((s, i) => {
          const on = i <= active;
          return (
            <li
              key={s.title}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-step={i}
              data-testid="story-step"
              className="relative flex min-h-[60vh] flex-col justify-center gap-3 py-8 md:min-h-[75vh]"
            >
              <span
                aria-hidden
                className={`absolute top-1/2 -left-14 grid size-9 -translate-y-1/2 place-items-center rounded-full border-2 font-mono text-sm font-bold transition-all duration-300 ${on ? 'scale-110 border-brand bg-brand text-brand-foreground' : 'border-border bg-background text-muted-foreground'}`}
              >
                {i + 1}
              </span>
              <h3 className={`text-3xl leading-tight tracking-[-0.03em] transition-opacity md:text-4xl ${active === i ? 'opacity-100' : 'opacity-40'}`}>{s.title}</h3>
              <p className={`max-w-[46ch] text-lg text-muted-foreground transition-opacity ${active === i ? 'opacity-100' : 'opacity-50'}`}>{s.text}</p>
              <div className="mt-4 md:hidden">
                <AppFrame url={s.url}>{s.screen}</AppFrame>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="hidden md:block">
        <div className="sticky top-[12vh]">
          <AppFrame url={steps[active]?.url ?? ''}>
            <div className="relative h-[30rem]">
              {steps.map((s, i) => (
                <div
                  key={s.title}
                  aria-hidden={active !== i}
                  className="absolute inset-0 transition-[opacity,transform] duration-500"
                  style={{ opacity: active === i ? 1 : 0, transform: active === i ? 'none' : `translateY(${i < active ? -16 : 16}px)` }}
                >
                  {s.screen}
                </div>
              ))}
            </div>
          </AppFrame>
        </div>
      </div>
    </div>
  );
}
