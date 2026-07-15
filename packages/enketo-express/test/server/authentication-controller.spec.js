// safer to ensure this here (in addition to grunt:env:test)
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { expect } = require('chai');
const config = require('../../app/models/config-model').server;

config['base path'] = '';

const app = require('../../config/express');

describe('Authentication Controller', () => {
    let offlineEnabled;

    before(() => {
        offlineEnabled = app.get('offline enabled');
    });

    after(() => {
        app.set('offline enabled', offlineEnabled);
    });

    /**
     * Logs in through the CSRF-protected form and hands the
     * `__enketo_meta_username` set-cookie header to `assertCookie`.
     *
     * @param {Function} done - mocha callback
     * @param {Function} assertCookie - assertion on the set-cookie header
     */
    function loginAndAssertUidCookie(done, assertCookie) {
        request(app)
            .get('/login')
            .expect(200)
            .end((err, res) => {
                if (err) {
                    return done(err);
                }
                const csrfCookie = (res.headers['set-cookie'] || []).find(
                    (cookieStr) => cookieStr.startsWith('_csrf=')
                );
                const tokenMatch = res.text.match(
                    /name="_csrf" value="([^"]+)"/
                );
                expect(csrfCookie, 'csrf cookie').to.be.a('string');
                expect(tokenMatch, 'csrf token').to.not.equal(null);

                return request(app)
                    .post('/login')
                    .set('Cookie', csrfCookie.split(';')[0])
                    .type('form')
                    .send({
                        username: 'alice',
                        password: 'secret',
                        _csrf: tokenMatch[1],
                    })
                    .end((postErr, postRes) => {
                        if (postErr) {
                            return done(postErr);
                        }
                        const uidCookie = (
                            postRes.headers['set-cookie'] || []
                        ).find((cookieStr) =>
                            cookieStr.startsWith('__enketo_meta_username=')
                        );
                        expect(
                            uidCookie,
                            '__enketo_meta_username cookie'
                        ).to.be.a('string');
                        assertCookie(uidCookie);

                        return done();
                    });
            });
    }

    it('sets the __enketo_meta_username cookie as HttpOnly when offline is disabled', (done) => {
        app.set('offline enabled', false);
        loginAndAssertUidCookie(done, (uidCookie) => {
            expect(uidCookie).to.match(/HttpOnly/i);
        });
    });

    it('keeps the __enketo_meta_username cookie JS-readable when offline is enabled (offline pages read it client-side)', (done) => {
        app.set('offline enabled', true);
        loginAndAssertUidCookie(done, (uidCookie) => {
            expect(uidCookie).to.not.match(/HttpOnly/i);
        });
    });
});
