// safer to ensure this here (in addition to grunt:env:test)
process.env.NODE_ENV = 'test';

const request = require('supertest');
const assert = require('assert');
const crypto = require('crypto');
const config = require('../../app/models/config-model').server;

config['base path'] = '';

const app = require('../../config/express');

/**
 * Builds a cookie-parser compatible signed cookie value, matching the
 * `cookie-signature` algorithm bundled with cookie-parser (HMAC-SHA256,
 * base64, stripped padding). Kept dependency-free by using node's crypto.
 *
 * @param {string} value - plain cookie value
 * @return {string} signed value in the `s:<value>.<signature>` format
 */
function signedCookie(value) {
    const signature = crypto
        .createHmac('sha256', config['encryption key'])
        .update(value)
        .digest('base64')
        .replace(/=+$/, '');

    return `s:${value}.${signature}`;
}

describe('Survey Controller', () => {
    describe('meta data: ', () => {
        const endpoints = [
            '/x/abcd',
            '/abcd',
            '/preview',
            '/preview/abcd',
            '/edit/abcd?instance_id=a',
        ];

        endpoints.forEach((endpoint) => {
            it(`endpoint ${endpoint} adds a __enketo_meta_deviceid cookie when absent`, (done) => {
                app.set('offline enabled', true);
                request(app)
                    .get(endpoint)
                    .expect(200)
                    .expect('set-cookie', /__enketo_meta_deviceid/)
                    .end(done);
            });

            it(`endpoint ${endpoint} sets the __enketo_meta_deviceid cookie as HttpOnly`, (done) => {
                app.set('offline enabled', true);
                request(app)
                    .get(endpoint)
                    .expect(200)
                    .end((err, res) => {
                        if (err) {
                            return done(err);
                        }
                        const cookies = res.headers['set-cookie'] || [];
                        const deviceCookie = cookies.find((c) =>
                            c.startsWith('__enketo_meta_deviceid=')
                        );
                        assert.ok(
                            deviceCookie,
                            'expected a __enketo_meta_deviceid cookie'
                        );
                        assert.ok(
                            /HttpOnly/i.test(deviceCookie),
                            'expected __enketo_meta_deviceid cookie to be HttpOnly'
                        );

                        return done();
                    });
            });
        });
    });

    describe('session metadata injection: ', () => {
        beforeEach(() => {
            app.set('offline enabled', true);
        });

        it('injects a window.__enketoSession object into the webform page', (done) => {
            request(app)
                .get('/x/abcd')
                .expect(200)
                .expect(/window\.__enketoSession\s*=/)
                .end(done);
        });

        it('always includes the deviceid in the injected session', (done) => {
            request(app)
                .get('/x/abcd')
                .expect(200)
                .expect(/window\.__enketoSession\s*=\s*\{[^<]*"deviceid":/)
                .end(done);
        });

        it('injects a signed __enketo_meta_username cookie into the session (so the cookie can be HttpOnly)', (done) => {
            request(app)
                .get('/x/abcd')
                .set(
                    'Cookie',
                    `__enketo_meta_username=${signedCookie('alice')}`
                )
                .expect(200)
                .expect(
                    /window\.__enketoSession\s*=\s*\{[^<]*"username":"alice"/
                )
                .end(done);
        });

        it('omits properties whose cookie is absent (so client-side readCookie fallback still applies)', (done) => {
            request(app)
                .get('/x/abcd')
                .expect(200)
                .end((err, res) => {
                    if (err) {
                        return done(err);
                    }
                    const match = res.text.match(
                        /window\.__enketoSession\s*=\s*(\{[^;]*\});/
                    );
                    assert.ok(
                        match,
                        'expected window.__enketoSession assignment'
                    );
                    const session = JSON.parse(match[1]);
                    assert.ok(
                        !('username' in session),
                        'expected username to be absent when no cookie is sent'
                    );

                    return done();
                });
        });
    });
});
