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

async.waterfall([
  function (callback) {
    github.misc.rateLimit({}, function(err, res) {
      if (err) {
        return callback(err);
      }
      var limits = res.resources.core;
      if (limits.remaining === 0) {
        console.log(limits);
        callback(new Error('API Limit Reached! Reset on ' + new Date(limits.reset * 1000)));
      } else {
        console.log(limits);
        callback();
      }
    });
  },
  function (callback) {
    github.repos.getFromOrg({org: 'Polymer'}, function(err, res) {
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
      console.log(l);
      github.repos.getCommit(l, function(err, res) {
        if (err) {
          return next(err);
        }
        next(null, {repo: l.repo, user: l.user, since: res.commit.committer.date});
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
          return rc.sha !== t.sha;
        });
        next(null, {repo: t.repo, commits: since.length});
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
  console.log(actual);
});
