import test from 'ava';
import '../index.js';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'concise',
});

test('test frozen stack bug', t => {
  // Test in same order as `passStyleOf` for easier maintenance.
  // Remotables tested separately below.
  let err1;
  try {
    1n / 0n;
  } catch (er) {
    err1 = er;
  }
  harden(err1);
});
