'use strict';

var http = require('http');
var express =require('express');

var request = require('superagent');
require('q-superagent')(request);
var methods = require('superagent/node_modules/methods');

var _ = require('lodash');
var binary = require('fn-binary');

exports = module.exports = reqUest;

exports.forwardCookie = forwardCookie;
function forwardCookie(res, r, alterPath) {
  var cookies = r.headers['set-cookie'];
  if (cookies) {
    cookies = cookies.map(function (cstr) {
      cstr = cstr.replace(/; *Domain=[^;]*(; *)?/i, '; ');
      if (alterPath === false) {
        return cstr;
      } else if ('function' == typeof alterPath) {
        return cstr.replace(/; *Path=(\/[^;]*)(; *)?/i, function (all, $1, $2) {
          return '; Path=' + alterPath($1) + ($2 || '');
        });
      } else {
        return cstr.replace(/; *Path=\/[^;]*(; *)?/i, '; Path=/$1');
      }
    });
    var prev = res.get('Set-Cookie');
    if (prev) {
      if (Array.isArray(prev)) {
        cookies = prev.concat(cookies);
      } else {
        cookies = [prev].concat(cookies);
      }
    }
    res.set('Set-Cookie', cookies);
  }
}

exports.augmentReqProto = augmentReqProto;
function augmentReqProto(reqProto, options) {
  options = options || {};
  var prefix, end;
  if (options.prefix) {
    prefix = options.prefix;
    delete options.prefix;
  }
  Object.defineProperty(reqProto, 'uest', {
    get: function () {
      var that = this;
      var agent = new http.Agent({maxSockets: 2});
      var p = !prefix ? function (url) { return url; } : function (url) {
        if (url[0] == '/') {
          return prefix + url;
        }
        return url;
      };
      function augment(r) {
        r.agent(agent);
        if (that.header) r.set('Cookie', that.header('cookie'));
        if (that.ips) r.set('X-Forwarded-For', [that.ip].concat(that.ips).join(','));
        return r;
      }
      function uest(method, url) {
        var r;

        // callback
        if ('function' == typeof url) {
          r = new request.Request('GET', p(method)).end(url);
        }

        // url first
        else if (1 == arguments.length) {
          r = new request.Request('GET', p(method));
        }

        else r = new Request(method, p(url));

        return augment(r);
      }
      methods.forEach(function (method) {
        uest[method] = function () {
          return augment(request[method].apply(null, arguments));
        };
      });
      uest.forwardCookie = forwardCookie.bind(null, this.res);
      Object.defineProperty(this, 'uest', {value: uest});
      return uest;
    }
  });
}

function reqUest(obj, options) {
  if (!obj.request) throw new Error('first argument should be express module or an express app object');
  return augmentReqProto(obj.request, options);
}
