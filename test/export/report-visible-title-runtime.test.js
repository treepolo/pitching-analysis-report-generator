'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  injectReportVisibleTitleRuntime,
  visibleTitleScript,
} = require('../../src/export/report-visible-title-runtime');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('visible title runtime restores 投球分析 only on the branded h1 text node', () => {
  const textNode = { nodeType: 3, textContent: '王小明報告' };
  const title = { firstChild: textNode };
  const script = visibleTitleScript().match(/<script data-report-visible-title-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
  vm.runInNewContext(script, {
    document: {
      querySelector(selector) {
        assert.equal(selector, 'body>main header.tree-polo-report-header .tree-polo-brand-copy h1');
        return title;
      },
    },
    Node: { TEXT_NODE: 3 },
  });
  assert.equal(textNode.textContent, '王小明投球分析報告');
});

test('visible title runtime injects once without rewriting static title or filenames', () => {
  const source = '<html><head><title>王小明報告by小樹Polo</title></head><body><main></main></body></html>';
  const once = injectReportVisibleTitleRuntime(source);
  const twice = injectReportVisibleTitleRuntime(once);
  assert.match(once, /<title>王小明報告by小樹Polo<\/title>/u);
  assert.equal((twice.match(/data-report-visible-title-runtime/g) || []).length, 1);
});

test('refined exporter keeps the short suffix for folder and html naming', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'tree-polo-refined-exporter.js'), 'utf8');
  assert.match(source, /const BRAND_SUFFIX = '報告by小樹Polo';/u);
  assert.match(source, /const targetHtmlName = `\$\{safeName\}\.html`;/u);
  assert.match(source, /const desiredName = shortenBrandSuffix\(baseResult\.safeName\);/u);
});

test('report renderer injects the visible-title runtime after the other report enhancements', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-visible-title-runtime'\)/u);
  assert.match(source, /html = injectReportVisibleTitleRuntime\(html\);/u);
});
