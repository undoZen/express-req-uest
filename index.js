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
  options.augments = null != options.augments && ~['object', 'function'].indexOf(typeof options.augments)
                   ? options.augments
                   : {};
  var augments = [];
  if (Array.isArray(options.augments)) {
    augments = options.augments
  } else if ('function' == typeof options.augments) {
    augments = [options.augments];
  } else if ('object' == typeof options.augments) {
    if (options.augments.agent !== false) {
      augments.push(function(r, req) {
        r.agent(new http.Agent({maxSockets: 2}));
      });
    }
    if (options.augments.cookies !== false) {
      augments.push(function(r, req) {
        var cookies;
        if (req.header && (cookies = req.header('cookie'))) {
          r.set('Cookie', cookies);
        }
        debug('cookies: %j', cookies);
        return r;
      });
    }
    if (options.augments.ips !== false) {
      augments.push(function(r, req) {
        var ips = [];
        if (req.ip && req.ip != '127.0.0.1') ips.push(req.ip);
        if (req.ips && Array.isArray(req.ips)) {
          ips = ips.concat(req.ips[0] == req.ip ? req.ips.slice(1) : req.ips);
        }
        debug('ips: %j', ips);
        if (ips.length) r.set('X-Forwarded-For', ips.join(', '));
        return r;
      });
    }
    if ('function' == typeof options.augments.custom) {
      augments.push(options.augments.custom);
    }
    delete options.augments;
  }
  Object.defineProperty(reqProto, 'uest', {
    get: function () {
      var that = this;
      var p = !prefix ? function (url) {
        debug('request url: %s', url);
        return url;
      } : function (url) {
        debug('augment url: %s', url);
        if (url[0] == '/') {
          return prefix + url;
        }
        debug('request url: %s', url);
        return url;
      };
      function augment(r) {

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

        augments.forEach(function (f) { f(r, that); });
        debug('headers: %j', r.request()._renderHeaders());
        return r;
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
