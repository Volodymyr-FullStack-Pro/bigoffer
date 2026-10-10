/** Saves a cover letter as a file in the browser: .docx (Word, for "attach a cover letter" forms) or plain .txt. */
export async function downloadLetter(text: string, baseName: string, kind: 'docx' | 'txt'): Promise<void> {
  const safe = baseName.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 80) || 'Cover letter';
  let blob: Blob;
  if (kind === 'txt') {
    blob = new Blob([text.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
  } else {
    // Loaded on demand: the Word writer is only needed when someone downloads a letter.
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const paragraphs = text.split(/\n/).map((line) => new Paragraph({ children: [new TextRun({ text: line, font: 'Calibri', size: 22 })], spacing: { after: line.trim() ? 0 : 120 } }));
    blob = await Packer.toBlob(new Document({ sections: [{ children: paragraphs }] }));
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
