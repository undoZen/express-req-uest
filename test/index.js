'use strict';

var assert = require('assert');
var reqUest = require('../');

var express = require('express');
var supertest = require('supertest');
var bodyParser = require('body-parser');

describe('express-req-uest', function () {
  var prefix, app;
  beforeEach(function (done) {
    var addr;
    var backend = express();
    backend.set('trust proxy', true);
    backend.use(function (req, res, next) {
      res.type('text');
      next();
    });
    backend.get('/ok', function (req, res) {
      res.end('OK');
    });
    backend.get('/ips', function (req, res) {
      res.end(req.headers['x-forwarded-for']);
    });
    backend.get('/cookie', function (req, res) {
      res.end(req.headers.cookie);
    });
    backend.post('/post', bodyParser(), function (req, res) {
      res.end(req.body.hello);
    });
    backend.get('/set-cookie', function (req, res) {
      res.cookie('hello', 'world', {path: '/helloworld', domain: 'example.com', maxAge: 60*60*1000});
      res.cookie('abc', '123', {path: '/abc123'});
      res.end('OK');
    });
    addr = backend.listen(null, done).address();
    prefix = 'http://' + addr.address + ':' + addr.port;

    app = express();
    reqUest(app);
  });

  it('should cache req.uest', function (done) {
    app.use('/test', function (req, res) {
      assert(!req.hasOwnProperty('uest'));
      var uest1 = req.uest;
      var uest2 = req.uest;
      assert(req.hasOwnProperty('uest'));
      assert(uest1 === uest2);
      res.statusCode = 204;
      res.end();
    });
    supertest(app)
      .get('/test')
      .expect(204, done);
  });

  it('sould work like superagent', function (done) {
    app.use('/test', function (req, res) {
      req.uest(prefix + '/ok').end(function (err, r) {
        assert(!err);
        assert.equal(r.text, 'OK');
        res.statusCode = 204;
        res.end();
      });
    });
    supertest(app)
      .get('/test')
      .expect(204, done);
  });

  it('sould work fine with methods', function (done) {
    app.use('/test', function (req, res) {
      req.uest.post(prefix + '/post').send({hello: 'world'}).end(function (err, r) {
        assert(!err);
        assert.equal(r.text, 'world');
        res.statusCode = 204;
        res.end();
      });
    });
    supertest(app)
      .get('/test')
      .expect(204, done);
  });

  it('prefix sould work fine with methods', function (done) {
    app = express();
    reqUest(app, {prefix: prefix});
    app.use('/test', function (req, res) {
      req.uest.post('/post').send({hello: 'world'}).end(function (err, r) {
        assert(!err);
        assert.equal(r.text, 'world');
        res.statusCode = 204;
        res.end();
      });
    });
    supertest(app)
      .get('/test')
      .expect(204, done);
  });

  it('sould have q() method', function (done) {
    app.use('/test', function (req, res) {
      req.uest(prefix + '/ok').q(function (r) {
        assert.equal(r.text, 'OK');
        res.statusCode = 204;
        res.end();
      })
      .done();
    });
    supertest(app)
      .get('/test')
      .expect(204, done);
  });

  it('sould have header x-forwarded-for', function (done) {
    app.use('/test', function (req, res) {
      req.uest(prefix + '/ips').q(function (r) {
        assert(r.text.indexOf('127.0.0.1') > -1);
        res.statusCode = 204;
        res.end();
      })
      .done();
    });
    supertest(app)
      .get('/test')
      .expect(204, done);
  });

  it('sould proxy cookie', function (done) {
    app.use('/test', function (req, res) {
      req.uest(prefix + '/cookie').q(function (r) {
        assert.equal(r.text, 'hello=world');
        res.statusCode = 204;
        res.end();
      })
      .done();
    });
    supertest(app)
      .get('/test')
      .set('cookie', 'hello=world')
      .expect(204, done);
  });

  it('add default prefix', function (done) {
    app = express();
    reqUest(app, {prefix: prefix});
    app.use('/test', function (req, res) {
      req.uest('/ok').q(function (r) {
        assert.equal(r.text, 'OK');
        res.statusCode = 204;
        res.end();
      })
      .done();
    });
    supertest(app)
      .get('/test')
      .set('cookie', 'hello=world')
      .expect(204, done);
  });

  it('forward cookie (alter path to / by default)', function (done) {
    app.use('/test', function (req, res) {
      req.uest(prefix + '/set-cookie').q(function (r) {
        assert.equal(r.text, 'OK');
        res.cookie('a', 'b');
        req.uest.forwardCookie(r);
        res.statusCode = 204;
        res.end();
      })
      .done();
    });
    supertest(app)
      .get('/test')
      .expect(204)
      .end(function (err, r) {
        var cookies = r.headers['set-cookie'];
        //cookies before forwardCookie() should be kept.
        assert(cookies[0].indexOf('a=b') > -1);
        //domain in forward cookies should be cleared.
        assert(cookies.every(function (cookie) { return !cookie.match(/; *Domain=/); }));
        //path sould be alter to / by default.
        assert(cookies.every(function (cookie) { return cookie.match(/Path=\/(;|$)/); }));
        done();
      });
  });

  it('forward cookie (turn off path alter)', function (done) {
    app.use('/test', function (req, res) {
      req.uest(prefix + '/set-cookie').q(function (r) {
        assert.equal(r.text, 'OK');
        req.uest.forwardCookie(r, false);
        res.statusCode = 204;
        res.end();
      })
      .done();
    });
    supertest(app)
      .get('/test')
      .expect(204)
      .end(function (err, r) {
        var cookies = r.headers['set-cookie'];
        assert(cookies[0].indexOf('Path=/helloworld') > -1);
        assert(cookies[1].indexOf('Path=/abc123') > -1);
        done();
      });
  });

  it('forward cookie (use function alterPath)', function (done) {
    app.use('/test', function (req, res) {
      req.uest(prefix + '/set-cookie').q(function (r) {
        assert.equal(r.text, 'OK');
        req.uest.forwardCookie(r, function (url) {
          if (url == '/abc123') return '/abc456';
          else return url;
        });
        res.statusCode = 204;
        res.end();
      })
      .done();
    });
    supertest(app)
      .get('/test')
      .expect(204)
      .end(function (err, r) {
        var cookies = r.headers['set-cookie'];
        assert(cookies[0].indexOf('Path=/helloworld') > -1);
        assert(cookies[1].indexOf('Path=/abc456') > -1);
        done();
      });
  });

});
