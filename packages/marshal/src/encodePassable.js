/* eslint-disable no-bitwise */
import {
  getTag,
  makeTagged,
  passStyleOf,
  assertRecord,
  isErrorLike,
  nameForPassableSymbol,
  passableSymbolForName,
} from '@endo/pass-style';

/** @typedef {import('@endo/pass-style').PassStyle} PassStyle */
/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('@endo/pass-style').RemotableObject} Remotable */
/** @template T @typedef {import('@endo/pass-style').CopyRecord<T>} CopyRecord */
/** @typedef {import('./types.js').RankCover} RankCover */

const { quote: q, Fail } = assert;
const { fromEntries, is } = Object;
const { ownKeys } = Reflect;

/**
 * Assuming that `record` is a CopyRecord, we have only
 * string-named own properties. `recordNames` returns those name *reverse*
 * sorted, because that's how records are compared, encoded, and sorted.
 *
 * @template T
 * @param {CopyRecord<T>} record
 * @returns {string[]}
 */
export const recordNames = record =>
  // https://github.com/endojs/endo/pull/1260#discussion_r1003657244
  // compares two ways of reverse sorting, and shows that `.sort().reverse()`
  // is currently faster on Moddable XS, while the other way,
  // `.sort(reverseComparator)`, is faster on v8. We currently care more about
  // XS performance, so we reverse sort using `.sort().reverse()`.
  harden(/** @type {string[]} */ (ownKeys(record)).sort().reverse());
harden(recordNames);

/**
 * Assuming that `record` is a CopyRecord and `names` is `recordNames(record)`,
 * return the corresponding array of property values.
 *
 * @template T
 * @param {CopyRecord<T>} record
 * @param {string[]} names
 * @returns {T[]}
 */
export const recordValues = (record, names) =>
  harden(names.map(name => record[name]));
harden(recordValues);

/**
 * @param {unknown} n
 * @param {number} size
 * @returns {string}
 */
export const zeroPad = (n, size) => {
  const nStr = `${n}`;
  assert(nStr.length <= size);
  const str = `00000000000000000000${nStr}`;
  const result = str.substring(str.length - size);
  assert(result.length === size);
  return result;
};
harden(zeroPad);

// This is the JavaScript analog to a C union: a way to map between a float as a
// number and the bits that represent the float as a buffer full of bytes.  Note
// that the mutation of static state here makes this invalid Jessie code, but
// doing it this way saves the nugatory and gratuitous allocations that would
// happen every time you do a conversion -- and in practical terms it's safe
// because we put the value in one side and then immediately take it out the
// other; there is no actual state retained in the classic sense and thus no
// re-entrancy issue.
const asNumber = new Float64Array(1);
const asBits = new BigUint64Array(asNumber.buffer);

// JavaScript numbers are encoded by outputting the base-16
// representation of the binary value of the underlying IEEE floating point
// representation.  For negative values, all bits of this representation are
// complemented prior to the base-16 conversion, while for positive values, the
// sign bit is complemented.  This ensures both that negative values sort before
// positive values and that negative values sort according to their negative
// magnitude rather than their positive magnitude.  This results in an ASCII
// encoding whose lexicographic sort order is the same as the numeric sort order
// of the corresponding numbers.

// TODO Choose the same canonical NaN encoding that cosmWasm and ewasm chose.
const CanonicalNaNBits = 'fff8000000000000';

/**
 * @param {number} n
 * @returns {string}
 */
const encodeBinary64 = n => {
  // Normalize -0 to 0 and NaN to a canonical encoding
  if (is(n, -0)) {
    n = 0;
  } else if (is(n, NaN)) {
    return `f${CanonicalNaNBits}`;
  }
  asNumber[0] = n;
  let bits = asBits[0];
  if (n < 0) {
    bits ^= 0xffffffffffffffffn;
  } else {
    bits ^= 0x8000000000000000n;
  }
  return `f${zeroPad(bits.toString(16), 16)}`;
};

/**
 * @param {string} encoded
 * @returns {number}
 */
const decodeBinary64 = encoded => {
  encoded.startsWith('f') || Fail`Encoded number expected: ${encoded}`;
  let bits = BigInt(`0x${encoded.substring(1)}`);
  if (encoded[1] < '8') {
    bits ^= 0xffffffffffffffffn;
  } else {
    bits ^= 0x8000000000000000n;
  }
  asBits[0] = bits;
  const result = asNumber[0];
  !is(result, -0) || Fail`Unexpected negative zero: ${encoded}`;
  return result;
};

/**
 * Encode a JavaScript bigint using a variant of Elias delta coding, with an
 * initial component for the length of the digit count as a unary string, a
 * second component for the decimal digit count, and a third component for the
 * decimal digits preceded by a gratuitous separating colon.
 * To ensure that the lexicographic sort order of encoded values matches the
 * numeric sort order of the corresponding numbers, the characters of the unary
 * prefix are different for negative values (type "n" followed by any number of
 * "#"s [which sort before decimal digits]) vs. positive and zero values (type
 * "p" followed by any number of "~"s [which sort after decimal digits]) and
 * each decimal digit of the encoding for a negative value is replaced with its
 * ten's complement (so that negative values of the same scale sort by
 * *descending* absolute value).
 *
 * @param {bigint} n
 * @returns {string}
 */
const encodeBigInt = n => {
  const abs = n < 0n ? -n : n;
  const nDigits = abs.toString().length;
  const lDigits = nDigits.toString().length;
  if (n < 0n) {
    return `n${
      // A "#" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      '#'.repeat(lDigits - 1)
    }${
      // The ten's complement of the count of digits.
      (10 ** lDigits - nDigits).toString().padStart(lDigits, '0')
    }:${
      // The ten's complement of the digits.
      (10n ** BigInt(nDigits) + n).toString().padStart(nDigits, '0')
    }`;
  } else {
    return `p${
      // A "~" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      '~'.repeat(lDigits - 1)
    }${
      // The count of digits.
      nDigits
    }:${
      // The digits.
      n
    }`;
  }
};

/**
 * @param {string} encoded
 * @returns {bigint}
 */
const decodeBigInt = encoded => {
  const typePrefix = encoded.charAt(0); // faster than encoded[0]
  let rem = encoded.slice(1);
  typePrefix === 'p' ||
    typePrefix === 'n' ||
    Fail`Encoded bigint expected: ${encoded}`;

  const lDigits = rem.search(/[0-9]/) + 1;
  lDigits >= 1 || Fail`Digit count expected: ${encoded}`;
  rem = rem.slice(lDigits - 1);

  rem.length >= lDigits || Fail`Complete digit count expected: ${encoded}`;
  const snDigits = rem.slice(0, lDigits);
  rem = rem.slice(lDigits);
  /^[0-9]+$/.test(snDigits) || Fail`Decimal digit count expected: ${encoded}`;
  let nDigits = parseInt(snDigits, 10);
  if (typePrefix === 'n') {
    // TODO Assert to reject forbidden encodings
    // like "n0:" and "n00:…" and "n91:…" through "n99:…"?
    nDigits = 10 ** lDigits - nDigits;
  }

  rem.startsWith(':') || Fail`Separator expected: ${encoded}`;
  rem = rem.slice(1);
  rem.length === nDigits ||
    Fail`Fixed-length digit sequence expected: ${encoded}`;
  let n = BigInt(rem);
  if (typePrefix === 'n') {
    // TODO Assert to reject forbidden encodings
    // like "n9:0" and "n8:00" and "n8:91" through "n8:99"?
    n = -(10n ** BigInt(nDigits) - n);
  }

  return n;
};

// Escape all characters from U+0000 NULL to U+001F INFORMATION SEPARATOR ONE
// like `!<character offset by 0x21>` to avoid JSON.stringify expansion to
// `\uHHHH`, and specially escape U+0020 SPACE (the array element terminator)
// as `!_` and U+0021 EXCLAMATION MARK (the escape prefix) as `!|`.
// Relative lexicographic ordering is preserved by this mapping of any character
// at or before `!` in the contiguous range [0x00..0x21] to a respective
// character in [0x21..0x40, 0x5F, 0x7C] preceded by `!` (which is itself in the
// replaced range).
// Similarly, escape `^` as `_@` and `_` as `__` because `^` indicates the start
// of an encoded array.
const stringEscapes = Array(0x22)
  .fill(undefined)
  .map((_, cp) => {
    switch (String.fromCharCode(cp)) {
      case ' ':
        return '!_';
      case '!':
        return '!|';
      default:
        return `!${String.fromCharCode(cp + 0x21)}`;
    }
  });
stringEscapes['^'.charCodeAt(0)] = '_@';
stringEscapes['_'.charCodeAt(0)] = '__';

const encodeStringWithEscapes = str =>
  `s${str.replaceAll(/[\0-!^_]/g, ch => stringEscapes[ch.charCodeAt(0)])}`;
const decodeStringWithEscapes = encoded => {
  return encoded
    .slice(1)
    .replaceAll(/([!_])(.|\n)?/g, (esc, prefix, suffix) => {
      switch (esc) {
        case '!_':
          return ' ';
        case '!|':
          return '!';
        case '_@':
          return '^';
        case '__':
          return '_';
        default: {
          const ch = /** @type {string} */ (suffix);
          (prefix === '!' && ch >= '!' && ch <= '@') ||
            Fail`invalid string escape: ${q(esc)}`;
          return String.fromCharCode(ch.charCodeAt(0) - 0x21);
        }
      }
    });
};

const encodeStringWithoutEscapes = str => `s${str}`;
const decodeStringWithoutEscapes = encoded => encoded.slice(1);

/**
 * Encodes an array into a sequence of encoded elements, each terminated by a
 * space (which is part of the escaped range in encoded strings).
 *
 * @param {unknown[]} array
 * @param {(p: Passable) => string} encodePassable
 * @returns {string}
 */
const encodeArrayWithoutEscapes = (array, encodePassable) => {
  const chars = ['^'];
  for (const element of array) {
    const enc = encodePassable(element);
    chars.push(enc, ' ');
  }
  return chars.join('');
};

/**
 * @param {string} encoded
 * @param {(encoded: string) => Passable} decodePassable
 * @returns {Array}
 */
const decodeArrayWithoutEscapes = (encoded, decodePassable) => {
  encoded.startsWith('^') || Fail`Encoded array expected: ${encoded}`;
  const tail = encoded.slice(1);
  const elements = [];
  let depth = 0;
  let nextIndex = 0;
  let currentElementStart = 0;
  for (const { 0: ch, index: i } of tail.matchAll(/[\^ ]/g)) {
    const index = /** @type {number} */ (i);
    if (ch === '^') {
      // This is the start of a nested array.
      // TODO: Since the syntax of nested arrays must be validated as part of
      // decoding the outer one, consider decoding them here into a shared cache
      // rather than discarding information about their contents until the later
      // decodePassable.
      depth += 1;
    } else {
      // This is a terminated element.
      if (index === nextIndex) {
        // A terminator after `[` or an another terminator indicates that an array is done.
        depth -= 1;
        depth >= 0 ||
          // prettier-ignore
          Fail`unexpected array element terminator: ${encoded.slice(0, index + 2)}`;
      }
      if (depth === 0) {
        // We have a complete element of the topmost array.
        elements.push(decodePassable(tail.slice(currentElementStart, index)));
        currentElementStart = index + 1;
      }
    }
    // Advance the index.
    nextIndex = index + 1;
  }
  depth === 0 || Fail`unterminated array: ${encoded}`;
  nextIndex === tail.length ||
    Fail`unterminated array element: ${tail.slice(currentElementStart)}`;
  return harden(elements);
};

/**
 * Performs the original array encoding, which escapes all array elements rather
 * than just strings (`\u0000` as the element terminator and `\u0001` as the
 * escape prefix for `\u0000` or `\u0001`).
 * This necessitated an undesirable amount of iteration and expansion; see
 * https://github.com/endojs/endo/pull/1260#discussion_r960369826
 *
 * @param {unknown[]} array
 * @param {(p: Passable) => string} encodePassable
 * @returns {string}
 */
const encodeArrayWithEscapes = (array, encodePassable) => {
  const chars = ['['];
  for (const element of array) {
    const enc = encodePassable(element);
    for (const c of enc) {
      if (c === '\u0000' || c === '\u0001') {
        chars.push('\u0001');
      }
      chars.push(c);
    }
    chars.push('\u0000');
  }
  return chars.join('');
};

/**
 * @param {string} encoded
 * @param {(encoded: string) => Passable} decodePassable
 * @returns {Array}
 */
const decodeArrayWithEscapes = (encoded, decodePassable) => {
  encoded.startsWith('[') || Fail`Encoded array expected: ${encoded}`;
  const elements = [];
  const elemChars = [];
  for (let i = 1; i < encoded.length; i += 1) {
    const c = encoded[i];
    if (c === '\u0000') {
      const encodedElement = elemChars.join('');
      elemChars.length = 0;
      const element = decodePassable(encodedElement);
      elements.push(element);
    } else if (c === '\u0001') {
      i += 1;
      i < encoded.length || Fail`unexpected end of encoding ${encoded}`;
      const c2 = encoded[i];
      c2 === '\u0000' ||
        c2 === '\u0001' ||
        Fail`Unexpected character after u0001 escape: ${c2}`;
      elemChars.push(c2);
    } else {
      elemChars.push(c);
    }
  }
  elemChars.length === 0 || Fail`encoding terminated early: ${encoded}`;
  return harden(elements);
};

const encodeRecord = (record, encodeArray, encodePassable) => {
  const names = recordNames(record);
  const values = recordValues(record, names);
  return `(${encodeArray(harden([names, values]), encodePassable)}`;
};

const decodeRecord = (encoded, decodeArray, decodePassable) => {
  assert(encoded.startsWith('('));
  const keysvals = decodeArray(encoded.substring(1), decodePassable);
  keysvals.length === 2 || Fail`expected keys,values pair: ${encoded}`;
  const [keys, vals] = keysvals;

  (passStyleOf(keys) === 'copyArray' &&
    passStyleOf(vals) === 'copyArray' &&
    keys.length === vals.length &&
    keys.every(key => typeof key === 'string')) ||
    Fail`not a valid record encoding: ${encoded}`;
  const mapEntries = keys.map((key, i) => [key, vals[i]]);
  const record = harden(fromEntries(mapEntries));
  assertRecord(record, 'decoded record');
  return record;
};

const encodeTagged = (tagged, encodeArray, encodePassable) =>
  `:${encodeArray(harden([getTag(tagged), tagged.payload]), encodePassable)}`;

const decodeTagged = (encoded, decodeArray, decodePassable) => {
  assert(encoded.startsWith(':'));
  const tagpayload = decodeArray(encoded.substring(1), decodePassable);
  tagpayload.length === 2 || Fail`expected tag,payload pair: ${encoded}`;
  const [tag, payload] = tagpayload;
  passStyleOf(tag) === 'string' ||
    Fail`not a valid tagged encoding: ${encoded}`;
  return makeTagged(tag, payload);
};

/**
 * @typedef {object} EncodeOptions
 * @property {(
 *   remotable: Remotable,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodeRemotable]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodePromise]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodeError]
 * @property {boolean} [xxx]
 */

/**
 * @param {EncodeOptions} [encodeOptions]
 * @returns {(passable: Passable) => string}
 */
export const makeEncodePassable = (encodeOptions = {}) => {
  const {
    encodeRemotable = (rem, _) => Fail`remotable unexpected: ${rem}`,
    encodePromise = (prom, _) => Fail`promise unexpected: ${prom}`,
    encodeError = (err, _) => Fail`error unexpected: ${err}`,
    xxx = false,
  } = encodeOptions;

  const encodeString = xxx
    ? encodeStringWithEscapes
    : encodeStringWithoutEscapes;
  const encodeArray = xxx ? encodeArrayWithoutEscapes : encodeArrayWithEscapes;

  const innerEncode = passable => {
    if (isErrorLike(passable)) {
      return encodeError(passable, innerEncode);
    }
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null': {
        return 'v';
      }
      case 'undefined': {
        return 'z';
      }
      case 'number': {
        return encodeBinary64(passable);
      }
      case 'string': {
        return encodeString(passable);
      }
      case 'boolean': {
        return `b${passable}`;
      }
      case 'bigint': {
        return encodeBigInt(passable);
      }
      case 'remotable': {
        const result = encodeRemotable(passable, innerEncode);
        result.startsWith('r') ||
          Fail`internal: Remotable encoding must start with "r": ${result}`;
        return result;
      }
      case 'error': {
        const result = encodeError(passable, innerEncode);
        result.startsWith('!') ||
          Fail`internal: Error encoding must start with "!": ${result}`;
        return result;
      }
      case 'promise': {
        const result = encodePromise(passable, innerEncode);
        result.startsWith('?') ||
          Fail`internal: Promise encoding must start with "?": ${result}`;
        return result;
      }
      case 'symbol': {
        const encName = encodeString(nameForPassableSymbol(passable));
        return `y${encName.slice(1)}`;
      }
      case 'copyArray': {
        return encodeArray(passable, innerEncode);
      }
      case 'copyRecord': {
        return encodeRecord(passable, encodeArray, innerEncode);
      }
      case 'tagged': {
        return encodeTagged(passable, encodeArray, innerEncode);
      }
      default: {
        throw Fail`a ${q(passStyle)} cannot be used as a collection passable`;
      }
    }
  };
  const encodePassable = xxx
    ? // A leading "#" indicates the v2 encoding (with escaping in strings rather than arrays).
      passable => `#${innerEncode(passable)}`
    : innerEncode;
  return harden(encodePassable);
};
harden(makeEncodePassable);

/**
 * @typedef {object} DecodeOptions
 * @property {(
 *   encodedRemotable: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Remotable} [decodeRemotable]
 * @property {(
 *   encodedPromise: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Promise} [decodePromise]
 * @property {(
 *   encodedError: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Error} [decodeError]
 */

/**
 * @param {DecodeOptions} [decodeOptions]
 * @returns {(encoded: string) => Passable}
 */
export const makeDecodePassable = (decodeOptions = {}) => {
  const {
    decodeRemotable = (rem, _) => Fail`remotable unexpected: ${rem}`,
    decodePromise = (prom, _) => Fail`promise unexpected: ${prom}`,
    decodeError = (err, _) => Fail`error unexpected: ${err}`,
  } = decodeOptions;

  const makeInnerDecode = (decodeString, decodeArray) => {
    const innerDecode = encoded => {
      switch (encoded.charAt(0)) {
        case 'v': {
          return null;
        }
        case 'z': {
          return undefined;
        }
        case 'f': {
          return decodeBinary64(encoded);
        }
        case 's': {
          return decodeString(encoded);
        }
        case 'b': {
          return encoded.substring(1) !== 'false';
        }
        case 'n':
        case 'p': {
          return decodeBigInt(encoded);
        }
        case 'r': {
          return decodeRemotable(encoded, innerDecode);
        }
        case '?': {
          return decodePromise(encoded, innerDecode);
        }
        case '!': {
          return decodeError(encoded, innerDecode);
        }
        case 'y': {
          const name = decodeString(`s${encoded.slice(1)}`);
          return passableSymbolForName(name);
        }
        case '[':
        case '^': {
          return decodeArray(encoded, innerDecode);
        }
        case '(': {
          return decodeRecord(encoded, decodeArray, innerDecode);
        }
        case ':': {
          return decodeTagged(encoded, decodeArray, innerDecode);
        }
        default: {
          throw Fail`invalid database key: ${encoded}`;
        }
      }
    };
    return innerDecode;
  };
  const decodePassable = encoded => {
    // A leading "#" indicates the v2 encoding (with escaping in strings rather than arrays).
    if (encoded.startsWith('#')) {
      const innerDecode = makeInnerDecode(
        decodeStringWithEscapes,
        decodeArrayWithoutEscapes,
      );
      return innerDecode(encoded.slice(1));
    }
    const innerDecode = makeInnerDecode(
      decodeStringWithoutEscapes,
      decodeArrayWithEscapes,
    );
    return innerDecode(encoded);
  };
  return harden(decodePassable);
};
harden(makeDecodePassable);

export const isEncodedRemotable = encoded => encoded.charAt(0) === 'r';
harden(isEncodedRemotable);

// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {Record<PassStyle, string>}
 * The single prefix characters to be used for each PassStyle category.
 * `bigint` is a two-character string because each of those characters
 * individually is a valid bigint prefix (`n` for "negative" and `p` for
 * "positive"), and copyArray is a two-character string because one encoding
 * prefixes arrays with `[` while the other uses `^` (which is prohibited from
 * appearing in an encoded string).
 * The ordering of these prefixes is the same as the rankOrdering of their
 * respective PassStyles, and rankOrder.js imports the table for this purpose.
 *
 * In addition, `|` is the remotable->ordinal mapping prefix:
 * This is not used in covers but it is
 * reserved from the same set of strings. Note that the prefix is > any
 * prefix used by any cover so that ordinal mapping keys are always outside
 * the range of valid collection entry keys.
 */
export const passStylePrefixes = {
  error: '!',
  copyRecord: '(',
  tagged: ':',
  promise: '?',
  copyArray: '[^',
  boolean: 'b',
  number: 'f',
  bigint: 'np',
  remotable: 'r',
  string: 's',
  null: 'v',
  symbol: 'y',
  undefined: 'z',
};
Object.setPrototypeOf(passStylePrefixes, null);
harden(passStylePrefixes);
