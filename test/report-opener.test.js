'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repositoryRoot = path.resolve(__dirname, '..');
const openerPath = path.join(repositoryRoot, 'report-opener', 'index.html');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'report-opener-pages.yml');

test('report opener is a first-class repository source with a local-only file flow', () => {
  const html = fs.readFileSync(openerPath, 'utf8');

  assert.match(html, /<input[^>]+type="file"[^>]+accept="[^"]*\.html/iu);
  assert.match(html, /URL\.createObjectURL\(htmlFile\)/u);
  assert.match(html, /new Blob\(\[file\], \{ type: 'text\/html;charset=utf-8' \}\)/u);
  assert.match(html, /<iframe[\s\S]+sandbox="allow-scripts/iu);
  assert.match(html, /報告只會在這台裝置的瀏覽器中讀取，不會上傳到 TREEPOLO 或 GitHub。/u);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/u);

  const scripts = [...html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/giu)].map((match) => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0]));
});

test('Pages workflow publishes the canonical report-opener source to the deployment branch after its contract test', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /branches:\s*\n\s*- worker\/desktop-vertical-slice/u);
  assert.match(workflow, /- 'report-opener\/\*\*'/u);
  assert.match(workflow, /- 'test\/report-opener\.test\.js'/u);
  assert.match(workflow, /node --test test\/report-opener\.test\.js/u);
  assert.match(workflow, /git fetch origin gh-pages/u);
  assert.match(workflow, /git worktree add[^\n]+origin\/gh-pages/u);
  assert.match(workflow, /cp -a report-opener\/\.[^\n]+pages_dir/u);
  assert.match(workflow, /git push origin HEAD:gh-pages/u);
  assert.doesNotMatch(workflow, /actions\/deploy-pages@/u);
});

test('gh-pages is treated as generated deployment output rather than a source of truth', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.doesNotMatch(workflow, /checkout[^\n]*ref:\s*gh-pages/iu);
  assert.doesNotMatch(workflow, /cp -a[^\n]*gh-pages[^\n]*report-opener/iu);
});
