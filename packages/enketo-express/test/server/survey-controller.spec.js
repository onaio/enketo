// safer to ensure this here (in addition to grunt:env:test)
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { expect } = require('chai');
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
    let offlineEnabled;

    before(() => {
        offlineEnabled = app.get('offline enabled');
    });

    after(() => {
        app.set('offline enabled', offlineEnabled);
    });

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
        });

        it('sets the __enketo_meta_deviceid cookie as HttpOnly when offline is disabled', (done) => {
            app.set('offline enabled', false);
            request(app)
                .get('/abcd')
                .expect(200)
                .end((err, res) => {
                    if (err) {
                        return done(err);
                    }
                    const cookies = res.headers['set-cookie'] || [];
                    const deviceCookie = cookies.find((c) =>
                        c.startsWith('__enketo_meta_deviceid=')
                    );
                    expect(deviceCookie, 'deviceid cookie').to.be.a('string');
                    expect(deviceCookie).to.match(/HttpOnly/i);

                    return done();
                });
        });

        it('keeps the __enketo_meta_deviceid cookie JS-readable when offline is enabled (offline pages read it client-side)', (done) => {
            app.set('offline enabled', true);
            request(app)
                .get('/abcd')
                .expect(200)
                .end((err, res) => {
                    if (err) {
                        return done(err);
                    }
                    const cookies = res.headers['set-cookie'] || [];
                    const deviceCookie = cookies.find((c) =>
                        c.startsWith('__enketo_meta_deviceid=')
                    );
                    expect(deviceCookie, 'deviceid cookie').to.be.a('string');
                    expect(deviceCookie).to.not.match(/HttpOnly/i);

                    return done();
                });
        });
    });

    describe('session metadata injection: ', () => {
        const extractSession = (res) => {
            const match = res.text.match(
                /window\.__enketoSession\s*=\s*(\{[^;]*\});/
            );
            expect(match, 'window.__enketoSession assignment').to.not.equal(
                null
            );

            return JSON.parse(match[1]);
        };

        beforeEach(() => {
            app.set('offline enabled', false);
        });

        it('injects a window.__enketoSession object into the webform page', (done) => {
            request(app)
                .get('/abcd')
                .expect(200)
                .expect(/window\.__enketoSession\s*=/)
                .end(done);
        });

        it('always includes the deviceid in the injected session', (done) => {
            request(app)
                .get('/abcd')
                .expect(200)
                .expect(/window\.__enketoSession\s*=\s*\{[^<]*"deviceid":/)
                .end(done);
        });

        it('injects a signed __enketo_meta_username cookie into the session (so the cookie can be HttpOnly)', (done) => {
            request(app)
                .get('/abcd')
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

        it('rejects a __enketo_meta_username cookie with a tampered signature', (done) => {
            request(app)
                .get('/abcd')
                .set(
                    'Cookie',
                    '__enketo_meta_username=s:mallory.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
                )
                .expect(200)
                .end((err, res) => {
                    if (err) {
                        return done(err);
                    }
                    const session = extractSession(res);
                    expect(session).to.not.have.property('username');

                    return done();
                });
        });

        it('omits properties whose cookie is absent (so client-side readCookie fallback still applies)', (done) => {
            request(app)
                .get('/abcd')
                .expect(200)
                .end((err, res) => {
                    if (err) {
                        return done(err);
                    }
                    const session = extractSession(res);
                    expect(session).to.not.have.property('username');

                    return done();
                });
        });

        it('escapes </script> sequences in cookie values (no script-context breakout)', (done) => {
            request(app)
                .get('/abcd')
                .set(
                    'Cookie',
                    `__enketo_meta_username=${signedCookie(
                        '</script><script>alert(1)</script>'
                    )}`
                )
                .expect(200)
                .end((err, res) => {
                    if (err) {
                        return done(err);
                    }
                    expect(res.text).to.not.include(
                        '</script><script>alert(1)'
                    );

                    return done();
                });
        });

        it('does not bake identity into the offline page (service-worker cached; keeps the client-side read)', (done) => {
            app.set('offline enabled', true);
            request(app)
                .get('/x/abcd')
                .set(
                    'Cookie',
                    `__enketo_meta_username=${signedCookie('alice')}`
                )
                .expect(200)
                .end((err, res) => {
                    if (err) {
                        return done(err);
                    }
                    const session = extractSession(res);
                    expect(session).to.deep.equal({});

                    return done();
                });
        });
    });
});
