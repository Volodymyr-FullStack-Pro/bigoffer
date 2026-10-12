import { describe, expect, it } from 'vitest';
import { isFrontendKeyword, keywordForms, keywordSearchVariants } from './keywords';

describe('keywordForms', () => {
  it('covers every spelling of the role word, plus markup for front-end', () => {
    expect(keywordForms('Frontend Developer')).toEqual(
      expect.arrayContaining(['frontend developer', 'front-end developer', 'front end developer', 'фронтенд developer', 'markup', 'верстальник']),
    );
    expect(keywordForms('full stack')).toEqual(expect.arrayContaining(['fullstack', 'full-stack', 'фулстек']));
    expect(keywordForms('react developer')).toEqual(['react developer']);
  });
});

describe('keywordSearchVariants', () => {
  it('adds the other Latin spellings and the Ukrainian word', () => {
    expect(keywordSearchVariants('frontend')).toEqual(['front-end', 'front end', 'фронтенд']);
    expect(keywordSearchVariants('full stack engineer')).toEqual(['fullstack engineer', 'full-stack engineer', 'фулстек']);
    expect(keywordSearchVariants('javascript developer')).toEqual([]);
  });
  it('knows front-end keywords', () => {
    expect(isFrontendKeyword('Front-End Engineer')).toBe(true);
    expect(isFrontendKeyword('full stack')).toBe(false);
  });
});
