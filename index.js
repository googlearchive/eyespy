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
var nopt = require('nopt');
var path = require('path');

var options = nopt(
  {
    'help': Boolean,
    'config': path,
    'token': path,
    'verbose': Boolean
  },
  {
    '?': '--help',
    'h': '--help',
    'c': '--config',
    't': '--token',
    'v': '--verbose'
  }
);

function printHelp() {
  var h = chalk.blue;
  var b = chalk.bold.underline;
  var d = chalk.dim;

  var help = [
    b('eyespy') + ': check github org for repositories that need new releases',
    '',
    b('Usage:'),
    '  eyespy ' + d('[OPTIONS]'),
    '',
    b('Options:'),
    '  ' + h('--token') + ', ' + h('-t') + ': Use this file containing a Github OAuth token to authenticate',
    '  ' + h('--config') + ', ' +  h('-c') + ': JSON config file',
    '  ' + h('--verbose') + ', ' + h('-v') + ': More verbose output logging operation steps ' + d('(Optional)'),
    '  ' + h('--help') + ', ' + h('-h') + ', ' + h('-?') + ': Print this message and exit ' + d('(Optional)')
  ];
  console.log(help.join('\n'));
  process.exit(0);
}

if (options.help || process.argv.length < 3) {
  printHelp();
}

if (!options.token) {
  console.log(chalk.red('Token is required'));
  process.exit(1);
}

if (!options.config) {
  console.log(chalk.red('Config is required'));
  process.exit(1);
}

if (options.verbose) {
  eyespy.setLogger(function(s) {
    console.log(chalk.dim('LOG: %s'), s);
  });
}

var TOKEN = require('fs').readFileSync(options.token, 'utf8').trim();

var LIMIT = 20;

function processConfig() {
  var config = require(options.config);
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
  var mytotal = 0;
  var total = 0;
  var repos = 0;
  _.each(results, function(res) {
    var nc = 0;
    if (res.stats) {
      nc = res.stats.total;
      mytotal += nc;
      total += res.commits;
      repos += 1;
    }
    console.log(chalk.green('%s/%s') + '\t' + chalk.dim('%d/%d commits'), res.user, res.repo, nc, res.commits);
  });
  
  console.log();
  console.log('Total repositories contributed to: ' + chalk.red('%d') + '/%d', repos, results.length);
  console.log('Total commits: ' + chalk.red('%d') + '/%d', mytotal, total);

  if (options.verbose) {
    console.log();
    eyespy.getApiLimit(function(err, limits) {
      var r = limits.remaining;
      console.log(chalk.blue('remaining API calls: %d'), r);
      console.log(chalk.blue('used: %d'), limit_start - r);
    });
  }
}
