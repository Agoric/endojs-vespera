// @ts-nocheck
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-restricted-globals */

/*
 * Must run before even commons.js
 */

const {
  getOwnPropertyDescriptor: FERAL_OBJECT_GOPD,
  getOwnPropertyDescriptors: FERAL_OBJECT_GOPDS,
  defineProperties,
  freeze,
} = Object;

if ('captureStackTrace' in Error) {
  const err = Error('just for discovery');
  const { get: FERAL_STACK_GETTER, set: FERAL_STACK_SETTER } =
    FERAL_OBJECT_GOPD(err, 'stack');
  if (FERAL_STACK_GETTER) {
    // Freeze these hidden primordials before they become inaccessible.
    // Not handled through the normal SES primordial discovery, because
    // they are supposed to remain inaccessible. We freeze them here just
    // in case they leak despite our efforts to hide them.
    freeze(FERAL_STACK_GETTER);
    freeze(FERAL_STACK_SETTER);

    const { getOwnPropertyDescriptor: FERAL_REFLECT_GOPD, apply } = Reflect;

    const {
      __lookupGetter__: FERAL_LOOKUP_GETTER,
      __lookupSetter__: FERAL_LOOKUP_SETTER,
    } = Object.prototype;

    const silentStackGet = obj => {
      try {
        // Only to trigger `Error.prepareStackTrace` on v8,
        // to give it a chance to replace the stack property before
        // anyone can sample the descriptor.
        obj.stack;
      } catch (_ignore) {
        // ignored error
      }
    };

    const assertNoLeak = cond => {
      if (cond) {
        throw new EvalError('Dangerous stack getter/setter would have leaked');
      }
    };

    const tamedObjectMethods = {
      getOwnPropertyDescriptor(obj, prop) {
        if (prop !== 'stack') {
          // fast path normal non-'stack' case
          return FERAL_OBJECT_GOPD(obj, prop);
        }
        silentStackGet(obj);
        const desc = FERAL_OBJECT_GOPD(obj, prop);
        assertNoLeak(
          desc?.get === FERAL_STACK_GETTER || desc?.set === FERAL_STACK_SETTER,
        );
        return desc;
      },
      getOwnPropertyDescriptors(obj) {
        if (!('stack' in obj)) {
          // fast path normal non-'stack' case
          return FERAL_OBJECT_GOPDS(obj);
        }
        silentStackGet(obj);
        const descs = FERAL_OBJECT_GOPDS(obj);
        assertNoLeak(
          descs?.stack?.get === FERAL_STACK_GETTER ||
            descs?.stack?.get === FERAL_STACK_GETTER,
        );
        return descs;
      },
    };

    const tamedReflectMethods = {
      getOwnPropertyDescriptor(obj, prop) {
        if (prop !== 'stack') {
          // fast path normal non-'stack' case
          return FERAL_REFLECT_GOPD(obj, prop);
        }
        silentStackGet(obj);
        const desc = FERAL_REFLECT_GOPD(obj, prop);
        assertNoLeak(
          desc?.get === FERAL_STACK_GETTER || desc?.set === FERAL_STACK_SETTER,
        );
        return desc;
      },
    };

    const tamedObjPrototypeMethods = {
      __lookupGetter__(prop) {
        if (prop !== 'stack') {
          // fast path normal non-'stack' case
          return apply(FERAL_LOOKUP_GETTER, this, [prop]);
        }
        silentStackGet(this);
        const getter = apply(FERAL_LOOKUP_GETTER, this, [prop]);
        assertNoLeak(getter === FERAL_STACK_GETTER);
        return getter;
      },
      __lookupSetter__(prop) {
        if (prop !== 'stack') {
          // fast path normal non-'stack' case
          return apply(FERAL_LOOKUP_SETTER, this, [prop]);
        }
        silentStackGet(this);
        const setter = apply(FERAL_LOOKUP_SETTER, this, [prop]);
        assertNoLeak(setter === FERAL_STACK_SETTER);
        return setter;
      },
    };

    defineProperties(Object, {
      getOwnPropertyDescriptor: {
        value: tamedObjectMethods.getOwnPropertyDescriptor,
      },
      getOwnPropertyDescriptors: {
        value: tamedObjectMethods.getOwnPropertyDescriptors,
      },
    });

    defineProperties(Reflect, {
      getOwnPropertyDescriptor: {
        value: tamedReflectMethods.getOwnPropertyDescriptor,
      },
    });

    defineProperties(Object.prototype, {
      __lookupGetter__: {
        value: tamedObjPrototypeMethods.__lookupGetter__,
      },
      __lookupSetter__: {
        value: tamedObjPrototypeMethods.__lookupSetter__,
      },
    });
  }
}
