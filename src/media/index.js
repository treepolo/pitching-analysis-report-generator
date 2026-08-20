'use strict';

const contract = require('./contract');
const frameCacheContract = require('./frame-cache-contract');
const ingest = require('./ingest');
const pathPolicy = require('./path-policy');
const toolAdapter = require('./tool-adapter');

module.exports = Object.freeze({
  ...pathPolicy,
  ...contract,
  ...frameCacheContract,
  ...ingest,
  ...toolAdapter,
});
