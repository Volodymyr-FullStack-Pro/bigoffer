'use client';
// Adapted from Aceternity UI (https://ui.aceternity.com, Aceternity License: use in end products; no resale as a component library).

import { motion, stagger, useAnimate, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';

/** Text that fades in word by word (blur → sharp); inherits the surrounding typography. Plain text for reduced motion. */
export function TextGenerateEffect({ words, className, step = 0.02, testId }: { words: string; className?: string; step?: number; testId?: string }) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate();

  useEffect(() => {
    if (reduce || !scope.current) return;
    void animate('span', { opacity: 1, filter: 'blur(0px)' }, { duration: 0.35, delay: stagger(step) });
  }, [words, reduce, animate, scope, step]);

  if (reduce) return <p data-testid={testId} className={className}>{words}</p>;
  return (
    <p ref={scope} data-testid={testId} className={className}>
      {words.split(' ').map((word, i) => (
        <motion.span key={`${i}-${word}`} style={{ opacity: 0, filter: 'blur(6px)' }}>
          {word}{' '}
        </motion.span>
      ))}
    </p>
  );
}
