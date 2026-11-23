import { describe, expect, it } from 'vitest';
import { dishFor } from '../src/routes/ai';
import { THALI_SYSTEM } from '../src/ai/prompts';

describe('thali dish names', () => {
  it('keeps catalogue ids and maps local names', () => {
    expect(dishFor('rice')).toBe('rice');
    expect(dishFor('other', 'Rosogolla')).toBe('rasgulla');
    expect(dishFor('other', 'bhaat')).toBe('rice');
    expect(dishFor('chapatis')).toBe('roti');
    expect(dishFor('other', 'Chapati')).toBe('roti');
    expect(dishFor('other', 'Pizza')).toBe('other');
  });
  it('lists every dish for the model', () => {
    expect(THALI_SYSTEM).toContain('ragi_mudde');
    expect(THALI_SYSTEM).toContain('dubki_kadhi');
  });
});
