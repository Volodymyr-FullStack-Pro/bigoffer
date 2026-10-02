import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, normalizeWhitespace } from './text';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('A &amp; B &lt;3 &#39;x&#39; &#x2F; &nbsp;!')).toBe("A & B <3 'x' /  !");
  });
});

describe('htmlToText', () => {
  it('keeps paragraph and list structure', () => {
    const html = '<p>About&nbsp;us</p><ul><li>React</li><li>Node</li></ul><p>Line<br>break</p>';
    expect(htmlToText(html)).toBe('About us\n• React\n• Node\nLine\nbreak');
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
