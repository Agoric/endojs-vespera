import test from 'ava';
import tameErrorConstructor from '../../src/error/tame-error-constructor.js';

const { '%InitialError%': InitialError } = tameErrorConstructor();

/*
 * Because of
 * https://github.com/tc39/proposal-error-stacks/issues/26#issuecomment-1675512619
 * in tame-v8-error-constructor, we have commented
 * out the feature being tested here. Should we later restore the feature,
 * we should also unskip this test.
 */
test.skip('tameErrorConstructor', t => {
  try {
    t.is(typeof InitialError.stackTraceLimit, 'number');
    InitialError.stackTraceLimit = 11;
    t.is(InitialError.stackTraceLimit, 11);
    const error = InitialError();
    t.is(typeof error.stack, 'string');
    InitialError.captureStackTrace(error);
    t.is(typeof error.stack, 'string');
  } catch (e) {
    t.not(e, e, 'unexpected exception');
  }
});
