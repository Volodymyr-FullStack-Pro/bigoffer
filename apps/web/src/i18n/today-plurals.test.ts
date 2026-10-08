import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

describe('today.subtitle plurals', () => {
  const sub = (locale: 'en' | 'uk' | 'ru', messages: typeof en, count: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createTranslator({ locale, messages, namespace: 'today' }) as any)('subtitle', { count }) as string;

  it('uk forms', () => {
    expect(sub('uk', uk as typeof en, 1)).toContain('відповідна вакансія');
    expect(sub('uk', uk as typeof en, 3)).toContain('відповідні вакансії');
    expect(sub('uk', uk as typeof en, 5)).toContain('відповідних вакансій');
  });
  it('ru forms', () => {
    expect(sub('ru', ru as typeof en, 1)).toContain('подходящая вакансия');
    expect(sub('ru', ru as typeof en, 3)).toContain('подходящие вакансии');
    expect(sub('ru', ru as typeof en, 5)).toContain('подходящих вакансий');
  });
  it('en singular', () => {
    expect(sub('en', en, 1)).toBe('1 matching job from the last 3 days');
    expect(sub('en', en, 2)).toBe('2 matching jobs from the last 3 days');
  });
});
