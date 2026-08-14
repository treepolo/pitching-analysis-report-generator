'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { toReportDocument } = require('../src/report-contract');

test('builds a renderer/export document seam without mutating the project', () => {
  const project = {
    displayName: 'Contract test',
    sections: [{
      id: 'summary',
      title: 'Summary',
      blocks: [{ id: 'summary-text', type: 'rich-text', content: 'Keep this text' }],
    }],
  };

  const document = toReportDocument(project);
  assert.deepEqual(document, {
    schemaVersion: 1,
    title: 'Contract test',
    sections: [{
      id: 'summary',
      title: 'Summary',
      blocks: [{ id: 'summary-text', type: 'rich-text', content: 'Keep this text' }],
    }],
  });
  assert.deepEqual(project.sections[0].blocks[0].content, 'Keep this text');
});
