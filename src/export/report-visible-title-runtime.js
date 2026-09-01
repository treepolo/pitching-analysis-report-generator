'use strict';

function visibleTitleScript() {
  return `<script data-report-visible-title-runtime>
(() => {
  const title = document.querySelector('body>main header.tree-polo-report-header .tree-polo-brand-copy h1');
  if (!title) return;
  const first = title.firstChild;
  if (!first || first.nodeType !== Node.TEXT_NODE) return;
  first.textContent = first.textContent.replace(/報告\\s*$/u, '投球分析報告');
})();
</script>`;
}

function injectReportVisibleTitleRuntime(html) {
  const source = String(html);
  if (source.includes('data-report-visible-title-runtime')) return source;
  const script = visibleTitleScript();
  return source.includes('</body>')
    ? source.replace('</body>', `${script}\n</body>`)
    : `${source}\n${script}`;
}

module.exports = {
  injectReportVisibleTitleRuntime,
  visibleTitleScript,
};
