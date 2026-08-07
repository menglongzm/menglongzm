import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateRenderedHtml } from '../scripts/validate-rendered-html.mjs';

describe('validateRenderedHtml - structure checks', () => {
  test('missing doctype should fail', () => {
    const html = '<html lang="en"><head><meta name="viewport" content="width=device-width"></head><body></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('doctype')));
  });

  test('missing lang should fail', () => {
    const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('lang')));
  });

  test('missing viewport should fail', () => {
    const html = '<!doctype html><html lang="en"><head></head><body></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('viewport')));
  });

  test('unreplaced placeholder should fail', () => {
    const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><script type="application/json" id="flow-data">__FLOW_DATA_JSON__</script></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('placeholder')));
  });

  test('external dependency should fail', () => {
    const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><script src="https://cdn.example.com/lib.js"></script></head><body></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('external')));
  });

  test('missing diagnostics interface should fail', () => {
    const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><script type="application/json" id="flow-data">{"version":2}</script></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('__flowDiagnostics')));
  });

  test('missing ResizeObserver should fail', () => {
    const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><script type="application/json" id="flow-data">{"version":2}</script><script>window.__flowDiagnostics=()=>({});window.__flowData={};</script></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('ResizeObserver')));
  });
});

describe('validateRenderedHtml - required controls', () => {
  test('missing play button should fail', () => {
    const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><script type="application/json" id="flow-data">{"version":2}</script><script>window.__flowDiagnostics=()=>({});window.__flowData={};new ResizeObserver(()=>{});</script></body></html>';
    const errors = validateRenderedHtml(html);
    assert.ok(errors.some((e) => e.includes('play button')));
  });
});
