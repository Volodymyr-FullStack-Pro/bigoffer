import { describe, expect, it } from 'vitest';
import { matchBankKey, splitQuestions } from './form-questions';

describe('splitQuestions', () => {
  it('splits numbered and question-mark lines, dropping noise', () => {
    const text = `Application form
1. What are your salary expectations?
2) When can you start
- Why are you looking for a new job?
Upload your CV
Rate your English (A1–C2):`;
    expect(splitQuestions(text)).toEqual([
      'What are your salary expectations?',
      'When can you start',
      'Why are you looking for a new job?',
      'Rate your English (A1–C2):',
    ]);
  });
  it('keeps a single question as is and caps at 20', () => {
    expect(splitQuestions('1.')).toEqual([]);
    expect(splitQuestions('Do you have Kubernetes experience?')).toEqual(['Do you have Kubernetes experience?']);
    expect(splitQuestions(Array.from({ length: 30 }, (_, i) => `Q${i}?`).join('\n'))).toHaveLength(20);
  });
});

describe('matchBankKey', () => {
  it('recognizes typical questions in en/uk/ru', () => {
    expect(matchBankKey('What are your salary expectations?')).toBe('salary');
    expect(matchBankKey('Які ваші зарплатні очікування?')).toBe('salary');
    expect(matchBankKey('Когда вы готовы приступить?')).toBe('start_date');
    expect(matchBankKey('When can you start')).toBe('start_date');
    expect(matchBankKey('Rate your English (A1–C2):')).toBe('english');
    expect(matchBankKey('Рівень англійської')).toBe('english');
    expect(matchBankKey('Why are you looking for a new job?')).toBe('why_looking');
    expect(matchBankKey('Remote or office?')).toBe('work_format');
    expect(matchBankKey('Do you have Kubernetes experience?')).toBeNull();
  });

  it('prefers null over a guess', () => {
    for (const q of [
      'Do you have experience with remote teams?',
      'Have you worked with English-speaking clients?',
      'Experience with Microsoft Office / Office 365?',
      'Hybrid cloud experience?',
      'On-site support experience?',
      'Experience with payment systems?',
      'Why are you interested in our company?',
      'English level and salary expectations?',
    ]) expect(matchBankKey(q), q).toBeNull();
  });
});

describe('matchBankKey, salary phrasings', () => {
  it('reads expectations-first salary questions in Ukrainian and Russian', () => {
    expect(matchBankKey('Очікування щодо зарплати')).toBe('salary');
    expect(matchBankKey('Ожидания по зарплате')).toBe('salary');
  });
});
