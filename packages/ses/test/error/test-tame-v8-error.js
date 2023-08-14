import test from 'ava';
import '../../index.js';

lockdown();

/*
 * Because of
 * https://github.com/tc39/proposal-error-stacks/issues/26#issuecomment-1675512619
 * in tame-v8-error-constructor, we have commented
 * out the feature being tested here. Should we later restore the feature,
 * we should also unskip this test.
 */
test.skip('lockdown Error is safe', t => {
  t.is(typeof Error.captureStackTrace, 'function');
  t.is(typeof Error.stackTraceLimit, 'number');
  t.is(typeof Error().stack, 'string');
});

/*
 * Because of
 * https://github.com/tc39/proposal-error-stacks/issues/26#issuecomment-1675512619
 * in tame-v8-error-constructor, we have commented
 * out the feature being tested here. Should we later restore the feature,
 * we should also unskip this test.
 */
test.skip('lockdown Error in Compartment is safe', t => {
  const c = new Compartment();
  t.is(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.is(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.is(c.evaluate('typeof Error().stack'), 'string');
});

/*
 * Because of
 * https://github.com/tc39/proposal-error-stacks/issues/26#issuecomment-1675512619
 * in tame-v8-error-constructor, we have commented
 * out the feature being tested here. Should we later restore the feature,
 * we should also unskip this test.
 */
test.skip('lockdown Error in nested Compartment is safe', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.is(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.is(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.is(c.evaluate('typeof Error().stack'), 'string');
});
