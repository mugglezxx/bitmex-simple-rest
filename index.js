const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

const version = require('./package.json').version;
const name = require('./package.json').name;

const BitmexError = require('./bitmexError');

const USER_AGENT = `${name}@${version}`;

class BitmexRest {
  constructor(config) {
    this.ua = USER_AGENT;
    this.timeout = 90 * 1000;
    this.expiration = 60 * 1000;

    if(!config) {
      return;
    }

    if(config.key && config.secret) {
      this.key = config.key;
      this.secret = config.secret;
    }

    if(config.timeout) {
      this.timeout = config.timeout;
    }

    if(config.expiration) {
      this.expiration = config.expiration;
    }

    if(config.userAgent) {
      this.ua += ' | ' + config.userAgent;
    }
  }


  // most code is from:
  // https://github.com/BitMEX/api-connectors/blob/81874dc618f953fd054f2a249f5d03fda3e48093/official-http/node-request/
  request({path, method, data, expiration, timeout}) {
    return new Promise((resolve, reject) => {
      if(!expiration) {
        expiration = this.expiration;
      }

      if(!timeout) {
        timeout = this.timeout;
      }

      path = '/api/v1' + path;

      let payload = '';
      if(method === 'POST') {
        payload = JSON.stringify(data);
      } else {
        path += '?' + querystring.stringify(data);
      }

      const start = +new Date;
      const expires = start + expiration;

      const signature = crypto.createHmac('sha256', this.secret)
        .update(method + path + expires + payload).digest('hex');

      const options = {
        host: 'www.bitmex.com',
        path,
        method,
        headers: {
          'User-Agent': this.ua,
          'content-type' : 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'api-expires': expires,
          'api-key': this.key,
          'api-signature': signature
        }
      };

      const req = https.request(options, res => {
        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', function(data) {
          buffer += data;
        });
        res.on('end', function() {

          if (res.statusCode !== 200) {
            let message;
            let resp;

            try {
              resp = JSON.parse(buffer);
              message = resp.error.message;
            } catch(e) {
              message = buffer;
            }

            return reject(new BitmexError(res.statusCode + ': ' + message, {
              statusCode: res.statusCode,
              headers: res.headers,
              data: resp
            }));
          }

          let data;
          try {
            data = JSON.parse(buffer);
          } catch (err) {
            return reject(new BitmexError(buffer, {
              statusCode: res.statusCode,
              headers: res.headers
            }));
          }

          resolve({
            data,
            headers: res.headers
          });
        });
      });

      req.on('error', err => {
        reject(err);
      });

      req.on('socket', socket => {
        socket.setTimeout(timeout);
        socket.on('timeout', function() {
          req.abort();
        });
      });

      if(method === 'GET') {
        req.end();
      } else {
        req.end(payload);
      }
    });
  }

};

module.exports = BitmexRest;