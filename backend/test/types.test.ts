import {
  parseCreateInput,
  parseUpdateInput,
  ValidationError,
} from '../src/types';

describe('parseCreateInput', () => {
  it('accepts a valid title and trims it', () => {
    expect(parseCreateInput({ title: '  buy milk ' })).toEqual({ title: 'buy milk' });
  });

  it('rejects missing title', () => {
    expect(() => parseCreateInput({})).toThrow(ValidationError);
  });

  it('rejects empty/whitespace title', () => {
    expect(() => parseCreateInput({ title: '   ' })).toThrow(ValidationError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseCreateInput('nope')).toThrow(ValidationError);
  });

  it('rejects a title over 500 chars', () => {
    expect(() => parseCreateInput({ title: 'x'.repeat(501) })).toThrow(ValidationError);
  });
});

describe('parseUpdateInput', () => {
  it('accepts a title-only update', () => {
    expect(parseUpdateInput({ title: 'new' })).toEqual({ title: 'new' });
  });

  it('accepts a completed-only update', () => {
    expect(parseUpdateInput({ completed: true })).toEqual({ completed: true });
  });

  it('rejects an empty update', () => {
    expect(() => parseUpdateInput({})).toThrow(ValidationError);
  });

  it('rejects a non-boolean completed', () => {
    expect(() => parseUpdateInput({ completed: 'yes' })).toThrow(ValidationError);
  });
});
