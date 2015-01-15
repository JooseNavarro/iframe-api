require('es6-promise').polyfill();

function isIframed() {
  return parent !== window;
}

var apiMethods = require('./lib/api-methods');
var la = require('./lib/la');
var stamp = require('./lib/post-stamp');

var iframeApi = function iframeApi(myApi, userOptions) {
  var params = {
    myApi: myApi,
    options: userOptions || {}
  };
  var log = params.options.debug || params.options.verbose ?
    console.log.bind(console) : function noop() {};

  return new Promise(function (resolve, reject) {

    function handshake(callerOptions, port) {
      console.log('handshake with caller', JSON.stringify(callerOptions));
      if (!isIframed()) {
        log('responding to handshake');
        apiMethods.handshake(port, params.options);
      }
    }

    function receiveApi(received, port) {
      try {
        var api = apiMethods.reviveApi(params.options, received, port);
        if (!isIframed() && params.myApi) {
          log('sending external api back to the iframe');
          apiMethods.send(params.myApi, port, params.options);
        }
        resolve(api);
      } catch (err) {
        reject(err);
      }
    }

    function callApiMethod(data, port) {
      var cmd = data.cmd;
      var args = data.args;
      la(typeof cmd === 'string', 'missing command string', cmd);
      if (!Array.isArray(args)) {
        args = [];
      }

      if (params.myApi) {
        var method = params.myApi[cmd];
        if (typeof method === 'function') {
          var result = method.apply(params.myApi, args);
          log('method', cmd, 'result', JSON.stringify(result));
          apiMethods.respond(port, data, result);
        } else {
          log('unknown command', cmd, 'from the parent');
        }
      }
    }

    function processMessage(e) {
      if (!e.data || !e.data.cmd) {
        log('invalid message received by the iframe API', e.data);
        return;
      }
      switch (e.data.cmd) {
        case '__handshake': {
          return handshake(e.data, e.source);
        }
        case '__api': {
          return receiveApi(e.data, e.source);
        }
        case '__method_response': {
          log('received response', e.data.result, 'to command', e.data.__stamp);
          return stamp(e.data);
        }
        default: {
          return callApiMethod(e.data, e.source);
        }
      }

    }
    window.addEventListener('message', processMessage);

    if (isIframed() && params.myApi) {
      apiMethods.handshake(parent, params.options);
      apiMethods.send(params.myApi, parent, params.options);
      /*
        TODO switch to promise-returning handshake
        apiMethods.handshake(parent, params.options)
          .then(function (optionsFromOtherSide) {
            var api = typeof params.myApi === 'function' ? params.myApi(optionsFromOtherSide) : params.myApi;
            apiMethods.send(params.myApi, parent, params.options);
          });
      */
    }
  });
};

module.exports = iframeApi;
