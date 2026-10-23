import { describe, expect, it } from 'vitest';
import { autofill } from './autofill';

const profile = {
  fullName: 'Olena Koval',
  contacts: { email: 'olena@example.com', phone: '+380 67 000 0000', linkedin: 'https://linkedin.com/in/olena' },
  bank: [{ key: 'salary', answer: { en: '$3500 per month', uk: '$3500 на місяць' } }],
};

describe('autofill', () => {
  it('fills contacts by label or input type and typical questions from the bank, leaving the rest', () => {
    const out = autofill(
      [
        { label: 'First name', type: 'text' },
        { label: 'Last name', type: 'text' },
        { label: 'Work email', type: 'text' },
        { label: '', type: 'tel' },
        { label: 'LinkedIn profile', type: 'url' },
        { label: 'What are your salary expectations?', type: 'text' },
        { label: 'Очікування щодо зарплати', type: 'textarea' },
        { label: 'Describe your experience with Kafka', type: 'textarea' },
        { label: 'Password', type: 'password' },
      ],
      profile,
    );
    expect(out).toEqual(['Olena', 'Koval', 'olena@example.com', '+380 67 000 0000', 'https://linkedin.com/in/olena', '$3500 per month', '$3500 на місяць', null, null]);
  });
});
