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

var async = require('async');
var _ = require('lodash');
var semver = require('semver');
var GH = require('github');
var TOKEN = require('fs').readFileSync('token', 'utf8').trim();

var github = new GH({
  version: '3.0.0'
});

github.authenticate({
  type: 'oauth',
  token: TOKEN
});

function accumulate(fn, cb) {
  var full = [];
  return function afn(err, response) {
    if (err) {
      return cb(err);
    }
    var intermediate = fn(response);
    full = full.concat(_.compact(intermediate));
    if (!github.hasNextPage(response)) {
      cb(null, full);
    } else {
      github.getNextPage(response, afn);
    }
  };
}

function flatten(cb) {
  return function(err, xs) {
    if (err) {
      return cb(err);
    } else {
      cb(null, _.flatten(xs, true));
    }
  };
}

function getApiLimit(cb) {
  github.misc.rateLimit({}, function(err, res) {
    if (err) {
      return cb(err);
    }
    cb(null, res.resources.core);
  });
}

var limit_start;

async.waterfall([
  function (callback) {
    getApiLimit(function(err, limits) {
      if (err) {
        return callback(err);
      }
      if (limits.remaining === 0) {
        console.log(limits);
        callback(new Error('API Limit Reached! Reset on ' + new Date(limits.reset * 1000)));
      } else {
        console.log(limits);
        limit_start = limits.remaining;
        callback();
      }
    });
  },
  function (callback) {
    github.repos.getFromOrg({org: 'Polymer', type: 'public'}, function(err, res) {
      console.log('getting repos');
      accumulate(function(array) {
        return _.map(array, function(r) {
          return {repo: r.name, user: r.owner.login};
        });
      }, callback)(err, res);
    });
  },
  function (repos, callback) {
    console.log('getting tags');
    async.mapLimit(repos, 20, function(r, next) {
      github.repos.getTags(r, function(err, res) {
        accumulate(function(array) {
          return _.map(array, function(a) {
            return {repo: r.repo, user: r.user, sha: a.commit.sha, name: a.name};
          });
        }, next)(err, res);
      });
    }, function(err, tags) {
      if (err) {
        return callback(err);
      }
      var sorted = _.map(_.filter(tags, function(t){ return t.length; }), function(ts) {
        return ts.sort(function(a, b) {
          return semver.rcompare(a.name, b.name);
        })[0];
      });
      callback(null, _.flatten(sorted, true));
    });
  },
  function (latest, callback) {
    console.log('mapping tags to commits');
    async.mapLimit(latest, 20, function(l, next) {
      github.repos.getCommit(l, function(err, res) {
        if (err) {
          return next(err);
        }
        next(null, {repo: l.repo, user: l.user, last_sha: l.sha, since: res.commit.committer.date});
      });
    }, callback);
  },
  function(tags, callback) {
    console.log('repos with commits past last tag');
    async.mapLimit(tags, 20, function(t, next) {
      github.repos.getCommits(t, function(err, res) {
        if (err) {
          return next(err);
        }
        var since = _.filter(res, function(rc) {
          return rc.sha !== t.last_sha;
        });
        next(null, {repo: t.repo, commits: since.length, last_tag: t.since});
      });
    }, flatten(callback));
  }
], function(err, results) {
  if (err) {
    console.error(err);
    process.exit(1);
    return;
  }
  var actual = _.filter(results, function(r) { return r.commits; });

  console.log();
  _.each(actual, function(as) {
    console.log("%s\t%d\t%s", as.repo, as.commits, as.last_tag);
  });
  console.log();

  getApiLimit(function(err, limits) {
    var r = limits.remaining;
    console.log('remaining API calls:', r);
    console.log('used:', limit_start - r);
  });

});
