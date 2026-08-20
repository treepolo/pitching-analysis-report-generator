'use strict';

const contract = require('./contract');
const frameCacheContract = require('./frame-cache-contract');
const frameCache = require('./frame-cache');
const ingest = require('./ingest');
const pathPolicy = require('./path-policy');
const toolAdapter = require('./tool-adapter');

module.exports = Object.freeze({
  ...pathPolicy,
  ...contract,
  ...frameCacheContract,
  ...frameCache,
  ...ingest,
  ...toolAdapter,
});
