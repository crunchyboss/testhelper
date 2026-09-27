import { describe, expect, it } from 'vitest';
import { bulletList, renderTemplate } from './prompt';

describe('renderTemplate', () => {
  it('fills placeholders and blanks unknown ones', () => {
    expect(renderTemplate('Sprache: {{sprache}} / {{ fehlt }}', { sprache: 'Arabisch' })).toBe('Sprache: Arabisch /');
  });

  it('collapses empty sections', () => {
    expect(renderTemplate('A\n\n{{leer}}\n\nB', {})).toBe('A\n\nB');
  });

  it('renders bullet lists', () => {
    expect(bulletList(['eins', 'zwei'])).toBe('- eins\n- zwei');
  });
});
