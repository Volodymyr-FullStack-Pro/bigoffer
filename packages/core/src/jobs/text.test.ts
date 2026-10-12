import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, normalizeWhitespace, textLang } from './text';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('A &amp; B &lt;3 &#39;x&#39; &#x2F; &nbsp;!')).toBe("A & B <3 'x' /  !");
  });
});

describe('decodeEntities robustness', () => {
  it('leaves invalid code points unchanged', () => {
    expect(decodeEntities('a &#x110000; b &#99999999; c')).toBe('a &#x110000; b &#99999999; c');
  });
  it('decodes common named entities', () => {
    expect(decodeEntities('&mdash;&ndash;&laquo;&raquo;&hellip;&euro;&rsquo;&lsquo;&ldquo;&rdquo;&bull;&copy;')).toBe('—–«»…€’‘“”•©');
  });
});

describe('htmlToText', () => {
  it('keeps paragraph and list structure', () => {
    const html = '<p>About&nbsp;us</p><ul><li>React</li><li>Node</li></ul><p>Line<br>break</p>';
    expect(htmlToText(html)).toBe('About us\n• React\n• Node\nLine\nbreak');
  });
  it('turns unclosed <p> tags into line breaks', () => {
    expect(htmlToText('<p>First<p>Second')).toBe('First\nSecond');
    expect(htmlToText('Acme | Engineer<p class="x">We build things')).toBe('Acme | Engineer\nWe build things');
  });
  it('passes plain text through and drops blank lines', () => {
    expect(htmlToText('One\n\n\n\nTwo   words')).toBe('One\nTwo words');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses all whitespace', () => {
    expect(normalizeWhitespace('  a \n\t b  ')).toBe('a b');
  });
});

describe('textLang', () => {
  it('detects the language of a form question', () => {
    expect(textLang('What institution(s) did you graduate from?')).toBe('en');
    expect(textLang('Який ваш досвід з React?')).toBe('uk');
    expect(textLang('Какой у вас опыт работы с React?')).toBe('ru');
    expect(textLang('Почему вы хотите работать у нас?')).toBe('ru');
    expect(textLang('Чому ви хочете працювати у нас?')).toBe('uk');
    expect(textLang('Опишіть свій React stack')).toBe('uk');
  });
});
