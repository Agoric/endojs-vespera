import { test } from 'tape-promise/tape';
import { evaluateProgram as evaluate } from '@agoric/evaluate';
import bundleSource from '..';

test('nestedEvaluate', async t => {
  try {
    const {
      moduleFormat: mf1,
      source: src1,
      sourceMap: map1,
    } = await bundleSource(`${__dirname}/../demo/dir1`, 'nestedEvaluate');

    const srcMap1 = `(${src1})\n${map1}`;

    // console.log(srcMap1);

    t.equal(mf1, 'nestedEvaluate', 'module format is nestedEvaluate');
    t.assert(src1.match(/require\('@agoric\/harden'\)/), 'harden is required');

    // Fake out `require('@agoric/harden')`.
    const require = _ => o => o;
    const nestedEvaluate = src => {
      // console.log('========== evaluating', src);
      return evaluate(src, { require, nestedEvaluate });
    };
    const ex1 = nestedEvaluate(srcMap1)();

    const bundle = ex1.default();
    const err = bundle.makeError('foo');
    // console.log(err.stack);
    t.assert(
      err.stack.indexOf('(/bundled-source/encourage.js:3:') >= 0,
      'bundled source is in stack trace with correct line number',
    );

    const {
      moduleFormat: mf2,
      source: src2,
      sourceMap: map2,
    } = await bundleSource(
      `${__dirname}/../demo/dir1/encourage.js`,
      'nestedEvaluate',
    );
    t.equal(mf2, 'nestedEvaluate', 'module format 2 is nestedEvaluate');

    const srcMap2 = `(${src2})\n${map2}`;

    const ex2 = nestedEvaluate(srcMap2)();
    t.equal(ex2.message, `You're great!`, 'exported message matches');
    t.equal(
      ex2.encourage('Nick'),
      `Hey Nick!  You're great!`,
      'exported encourage matches',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('getExport', async t => {
  try {
    const {
      moduleFormat: mf1,
      source: src1,
      sourceMap: map1,
    } = await bundleSource(`${__dirname}/../demo/dir1`, 'getExport');

    const srcMap1 = `(${src1})\n${map1}`;

    // console.log(srcMap1);

    t.equal(mf1, 'getExport', 'module format is getExport');
    t.assert(src1.match(/require\('@agoric\/harden'\)/), 'harden is required');

    // Fake out `require('@agoric/harden')`.
    // eslint-disable-next-line no-eval
    const ex1 = eval(`const require = _ => o => o;${srcMap1}`)();

    const bundle = ex1.default();
    const err = bundle.makeError('foo');
    t.assert(
      err.stack.indexOf('(/bundled-source/encourage.js:') < 0,
      'bundled source is not in stack trace',
    );

    const {
      moduleFormat: mf2,
      source: src2,
      sourceMap: map2,
    } = await bundleSource(`${__dirname}/../demo/dir1/encourage.js`);
    t.equal(mf2, 'nestedEvaluate', 'module format 2 is nestedEvaluate');

    const srcMap2 = `(${src2})\n${map2}`;

    const nestedEvaluate = src => {
      // console.log('========== evaluating', src, '\n=========');
      return evaluate(src, { require, nestedEvaluate });
    };
    // eslint-disable-next-line no-eval
    const ex2 = nestedEvaluate(srcMap2)();
    t.equal(ex2.message, `You're great!`, 'exported message matches');
    t.equal(
      ex2.encourage('Nick'),
      `Hey Nick!  You're great!`,
      'exported encourage matches',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('babel-parser types', async t => {
  // Once upon a time, bundleSource mangled:
  //   function createBinop(name, binop) {
  //     return new TokenType(name, {
  //       beforeExpr,
  //       binop
  //     });
  //   }
  // into:
  //  function createBinop(name, binop) {  return new TokenType(name, {    beforeExpr,;    binop });};
  //
  // Make sure it's ok now. The function in question came
  // from @agoric/babel-parser/lib/tokenizer/types.js

  try {
    const { source: src1 } = await bundleSource(
      `${__dirname}/../demo/babel-parser-mangling.js`,
      'getExport',
    );

    t.assert(!src1.match(/beforeExpr,;/), 'source is not mangled that one way');
    // the mangled form wasn't syntactically valid, do a quick check
    // eslint-disable-next-line no-eval
    (1, eval)(`(${src1})`);
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
