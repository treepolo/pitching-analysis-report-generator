'use strict';

const contract = require('./contract');
const pathPolicy = require('./path-policy');

module.exports = Object.freeze({
  ...pathPolicy,
  ...contract,
});
