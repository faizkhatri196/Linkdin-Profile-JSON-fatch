const cache = require('../../src/utils/cache');

describe('In-Memory Cache Unit Tests', () => {
  beforeEach(() => {
    cache.flush();
  });

  test('should set, get, and check existence of cached keys', () => {
    expect(cache.has('test_key')).toBe(false);
    expect(cache.get('test_key')).toBeNull();

    cache.set('test_key', { foo: 'bar' });
    expect(cache.has('test_key')).toBe(true);
    expect(cache.get('test_key')).toEqual({ foo: 'bar' });
  });

  test('should delete keys from cache', () => {
    cache.set('to_del', 'value');
    expect(cache.has('to_del')).toBe(true);
    cache.del('to_del');
    expect(cache.has('to_del')).toBe(false);
  });

  test('should report cache statistics', () => {
    const stats = cache.getStats();
    expect(stats).toHaveProperty('keys');
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
  });
});
