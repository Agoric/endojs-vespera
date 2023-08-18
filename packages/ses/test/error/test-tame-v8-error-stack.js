/* eslint-disable no-underscore-dangle */

import test from 'ava';
// Importing will tame as a side effect
import {
  FERAL_STACK_GETTER,
  FERAL_STACK_SETTER,
} from '../../src/error/tame-v8-stack-descriptor.js';

import '../../index.js';

lockdown();

const haveStackAccessor = !!(FERAL_STACK_GETTER || FERAL_STACK_SETTER);

const testIfTamed = haveStackAccessor ? test : test.skip;
const testFailingIfTamed = haveStackAccessor ? test.failing : test;
const testIfTamedFailing = haveStackAccessor ? test.failing : test.skip;

if (haveStackAccessor) {
  console.log('Engine has own Error stack accessors');
}

const makeError = () => {
  try {
    null.error;
  } catch (e) {
    return e;
  }
  return Error();
};

test('simple stack access', t => {
  const err = makeError();
  const sentinel = {};

  t.is(err.stack, '');
  t.throws(() => {
    err.stack = sentinel;
  });
  t.is(err.stack, '');
});

// This is deficiency of the stack taming on current v8 versions too
test.failing('can harden error and read stack', t => {
  const err = harden(makeError());
  t.is(err.stack, '');
});

test('lookup stack accessors', t => {
  const err = makeError();
  const getStack = err.__lookupGetter__('stack');
  const setStack = err.__lookupSetter__('stack');

  t.is(getStack, undefined);
  t.is(setStack, undefined);
});

testIfTamed('lookup stack accessors on frozen object', t => {
  const err = Object.freeze(makeError());
  t.throws(() => err.__lookupGetter__('stack'));
  t.throws(() => err.__lookupSetter__('stack'));
});

// Escape
testFailingIfTamed('Reflect get/set', t => {
  const stackPower = makeError();
  const getStack = e => Reflect.get(stackPower, 'stack', e);
  const setStack = (e, value) => Reflect.set(stackPower, 'stack', value, e);

  const err = makeError();
  const sentinel = {};

  t.is(getStack(err), '');
  t.false(setStack(err, sentinel));
  t.is(getStack(err), '');
});

// Escape
testIfTamedFailing('test stack accessors through property descriptor', t => {
  const err = makeError();

  const errProxy = new Proxy(err, {
    has(target, p) {
      if (p === 'stack') return false;
      return Reflect.has(target, p);
    },
  });

  const getStackAccessors = () => {
    const {
      stack: { get: getStack, set: setStack },
    } = Object.getOwnPropertyDescriptors(errProxy);
    return { getStack, setStack };
  };

  t.throws(() => getStackAccessors());
});
