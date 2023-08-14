// @ts-nocheck
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-restricted-globals */

const {
  getOwnPropertyDescriptor: FERAL_OBJECT_GOPD,
  getOwnPropertyDescriptors: FERAL_OBJECT_GOPDS,
  defineProperties,
} = Object;

const {
  getOwnPropertyDescriptor: FERAL_REFLECT_GOPD,
  apply,
} = Reflect;

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
}

const tamedObjectMethods = {
  getOwnPropertyDescriptor(obj, prop) {
    if (prop === 'stack') {
      silentStackGet(obj);
    }
    return FERAL_OBJECT_GOPD(obj, prop);
  },
  getOwnPropertyDescriptors(obj) {
    if ('stack' in obj) {
      silentStackGet(obj);
    }
    return FERAL_OBJECT_GOPDS(obj);
  },
};

const tamedReflectMethods = {
  getOwnPropertyDescriptor(obj, prop) {
    if (prop === 'stack') {
      silentStackGet(obj);
    }
    return FERAL_REFLECT_GOPD(obj, prop);
  },
};

const tamedObjPrototypeMethods = {
  __lookupGetter__(prop) {
    if (prop === 'stack') {
      silentStackGet(this);
    }
    return apply(FERAL_LOOKUP_GETTER, this, [prop]);
  },
  __lookupSetter__(prop) {
    if (prop === 'stack') {
      silentStackGet(this);
    }
    return apply(FERAL_LOOKUP_SETTER, this, [prop]);
  },
};

if ('captureStackTrace' in Error) {
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
  })

  defineProperties(Object.prototype, {
    __lookupGetter__: {
      value: tamedObjPrototypeMethods.__lookupGetter__,
    },
    __lookupSetter__: {
      value: tamedObjPrototypeMethods.__lookupSetter__,
    },
  });
}
