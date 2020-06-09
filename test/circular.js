import { test } from 'tape-promise/tape';
import { evaluateProgram as evaluate } from '@agoric/evaluate';
import bundleSource from '..';

test('circular export', async t => {
  try {
    const { source: src1 } = await bundleSource(
      `${__dirname}/../demo/circular/a.js`,
      'nestedEvaluate',
    );

    // Fake out `require('@agoric/harden')`.
    const require = _ => o => o;
    const nestedEvaluate = src => {
      // console.log('========== evaluating', src);
      return evaluate(src, { require, nestedEvaluate });
    };
    // console.log(src1);
    const srcMap1 = `(${src1})`;
    const ex1 = nestedEvaluate(srcMap1)();

    // console.log(err.stack);
    t.equals(ex1.default, 'Foo', `circular export is Foo`);
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
