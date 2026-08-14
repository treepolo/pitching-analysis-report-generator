'use strict';

const contract = require('./contract');
const ingest = require('./ingest');
const pathPolicy = require('./path-policy');

module.exports = Object.freeze({
  ...pathPolicy,
  ...contract,
  ...ingest,
});
