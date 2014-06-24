'use strict';

var http = require('http');

var debug = require('debug')('req-uest');
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
        debug('url: %s', url);
        return url;
      };
      function augment(r) {
        r.agent(agent);
        var cookies;
        if (that.header && (cookies = that.header('cookie'))) r.set('Cookie', cookies);
        debug('cookies: %j', cookies);

        var ips = [];
        if (that.ip && that.ip != '127.0.0.1') ips.push(that.ip);
        if (that.ips && Array.isArray(that.ips)) {
          ips.concat(that.ips[0] == that.ip ? that.ips.slice(1) : that.ips);
        }
        debug('ips: %j', ips);
        debug('headers: %j', that.headers);
        if (ips.length) r.set('X-Forwarded-For', ips.join(','));
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

        else r = new request.Request(method, p(url));

        return augment(r);
      }
      methods.forEach(function (method) {
        uest[{'delete':'del'}[method]||method] = function (url, fn) {
          var r = uest(method.toUpperCase(), url);
          fn && r.end(fn);
          return r;
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
