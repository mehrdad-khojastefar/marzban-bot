import { describe, it, expect } from 'vitest';
import { modelFromSql, operationFromSql } from '../metrics';

describe('modelFromSql', () => {
  it('extracts the model name from a quoted FROM clause', () => {
    expect(modelFromSql('SELECT "id" FROM "users" WHERE "chat_id" = $1')).toBe('users');
  });

  it('extracts the model name from an unquoted FROM clause', () => {
    expect(modelFromSql('SELECT id FROM accounts WHERE user_id = $1')).toBe('accounts');
  });

  it('returns "unknown" when no FROM clause is present', () => {
    expect(modelFromSql('BEGIN')).toBe('unknown');
    expect(modelFromSql('COMMIT')).toBe('unknown');
  });
});

describe('operationFromSql', () => {
  it.each([
    ['SELECT * FROM users', 'select'],
    ['INSERT INTO accounts ...', 'insert'],
    ['UPDATE transactions SET ...', 'update'],
    ['DELETE FROM accounts ...', 'delete'],
    ['BEGIN', 'tx_begin'],
    ['COMMIT', 'tx_commit'],
    ['ROLLBACK', 'tx_rollback'],
    ['EXPLAIN ANALYZE ...', 'other'],
    ['  select 1', 'select'],
  ])('classifies %s as %s', (sql, expected) => {
    expect(operationFromSql(sql)).toBe(expected);
  });
});
