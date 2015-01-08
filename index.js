#!/usr/bin/env node
/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

// jshint node: true

'use strict';

var chalk = require('chalk');
var _ = require('lodash');
var eyespy = require('./lib/eyespy.js');

var TOKEN = require('fs').readFileSync('token', 'utf8').trim();

var LIMIT = 20;

function processConfig() {
  var config = require('./config.json');
  var bl = config.blacklist;
  if (bl) {
    Object.keys(bl).forEach(function(o) {
      var blo = bl[o];
      if (blo.regex) {
        blo.regex = blo.regex.map(function(blr) {
          return new RegExp(blr);
        });
      }
    });
  }
  return config;
}

eyespy.authenticate(TOKEN);
eyespy.setConfig(processConfig());

eyespy.getApiLimit(function(err, limits) {
  var count = limits.remaining;
  eyespy.go(function(err, results) {
    if (err) {
      console.log(chalk.red(err));
      process.exit(1);
      return;
    }
    printOutput(results, count);
  });
});

function printOutput(results, limit_start) {
  var actual = _.filter(results, function(r) { return r.commits; });

  _.each(actual, function(as) {
    console.log(chalk.green('%s/%s') + '\t' + chalk.gray('%d'), as.user, as.repo, as.commits);
  });
  console.log();

  eyespy.getApiLimit(function(err, limits) {
    var r = limits.remaining;
    console.log(chalk.blue('remaining API calls: %d'), r);
    console.log(chalk.blue('used: %d'), limit_start - r);
  });
}
