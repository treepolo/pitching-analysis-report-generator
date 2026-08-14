'use strict';

const contract = require('./contract');
const ingest = require('./ingest');
const pathPolicy = require('./path-policy');
const toolAdapter = require('./tool-adapter');

module.exports = Object.freeze({
  ...pathPolicy,
  ...contract,
  ...ingest,
  ...toolAdapter,
});
