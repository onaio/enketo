/**
 * @module survey-encryption.spec.js
 * @description Tests functionality around encryption-enabled surveys
 * @see {ConnectionSpec}
 * @see {EncryptorSpec}
 * @see {LastSavedFeatureSpec}
 */

import connection from '../../../public/js/src/module/connection';
import encryptor from '../../../public/js/src/module/encryptor';
import fileManager from '../../../public/js/src/module/file-manager';
import { getLastSavedRecord } from '../../../public/js/src/module/last-saved';
import records from '../../../public/js/src/module/records-queue';
import settings from '../../../public/js/src/module/settings';
import store from '../../../public/js/src/module/store';

/**
 * @typedef {import('../connection.spec.js')} ConnectionSpec
 */

/**
 * @typedef {import('../encryptor.spec.js')} EncryptorSpec
 */

/**
 * @typedef {import('./last-saved.spec.js')} LastSavedFeatureSpec
 */

/**
 * @typedef {import('../../../app/models/survey-model').SurveyObject} Survey
 */

describe('Encryption-enabled surveys', () => {
    const enketoId = 'surveyA';

    /** @type { SinonSandbox } */
    let sandbox;

    /** @type {Survey} */
    let survey;

    beforeEach((done) => {
        sandbox = sinon.createSandbox();
        sandbox.stub(settings, 'enketoId').get(() => enketoId);

        survey = {
            openRosaId: 'formA',
            openRosaServer: 'http://localhost:3000',
            enketoId,
            theme: '',
            form: `<form class="or"><img src="/path/to/${enketoId}.jpg"/></form>`,
            model: '<model><foo/></model>',
            hash: '12345',
        };

        store.init().then(() => done(), done);
    });

    afterEach((done) => {
        sandbox.restore();

        Promise.all([store.record.removeAll(), store.survey.removeAll()]).then(
            () => done(),
            done
        );
    });

    describe('runtime state', () => {
        it('is not enabled by default', () => {
            expect(encryptor.isEncryptionEnabled(survey)).to.equal(false);
        });

        it('is enabled when set', () => {
            const result = encryptor.setEncryptionEnabled(survey);

            expect(encryptor.isEncryptionEnabled(result)).to.equal(true);
        });
    });

    describe('client storage', () => {
        it('creates an encryption-enabled survey', (done) => {
            const encryptedSurvey = encryptor.setEncryptionEnabled(survey);

            store.survey
                .set(encryptedSurvey)
                .then((result) => {
                    expect(encryptor.isEncryptionEnabled(result)).to.equal(
                        true
                    );
                })
                .then(done, done);
        });

        it('gets an encryption-enabled survey', (done) => {
            const encryptedSurvey = encryptor.setEncryptionEnabled(survey);

            store.survey
                .set(encryptedSurvey)
                .then(() => store.survey.get(survey.enketoId))
                .then((result) => {
                    expect(encryptor.isEncryptionEnabled(result)).to.equal(
                        true
                    );
                })
                .then(done, done);
        });

        it('updates an encryption-enabled survey', (done) => {
            const encryptedSurvey = encryptor.setEncryptionEnabled(survey);
            const model = '<model><updated/></model>';
            const update = Object.assign(encryptedSurvey, {
                model,
            });

            store.survey
                .set(encryptedSurvey)
                .then(() => store.survey.update(update))
                .then((result) => {
                    expect(encryptor.isEncryptionEnabled(result)).to.equal(
                        true
                    );
                    expect(result.model).to.equal(model);
                })
                .then(done, done);
        });

        it('does not create a last-saved record when creating a record for an encrypted survey', (done) => {
            const form = {
                id: 'abc',
                version: '2',
                encryptionKey:
                    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5s9p+VdyX1ikG8nnoXLCC9hKfivAp/e1sHr3O15UQ+a8CjR/QV29+cO8zjS/KKgXZiOWvX+gDs2+5k9Kn4eQm5KhoZVw5Xla2PZtJESAd7dM9O5QrqVJ5Ukrq+kG/uV0nf6X8dxyIluNeCK1jE55J5trQMWT2SjDcj+OVoTdNGJ1H6FL+Horz2UqkIObW5/elItYF8zUZcO1meCtGwaPHxAxlvODe8JdKs3eMiIo9eTT4WbH1X+7nJ21E/FBd8EmnK/91UGOx2AayNxM0RN7pAcj47a434LzeM+XCnBztd+mtt1PSflF2CFE116ikEgLcXCj4aklfoON9TwDIQSp0wIDAQAB',
            };

            const survey = encryptor.setEncryptionEnabled({
                openRosaId: 'formC',
                openRosaServer: 'http://localhost:3000',
                enketoId,
                theme: '',
                form: `<form class="or"><img src="/path/to/${enketoId}.jpg"/></form>`,
                model: '<model><foo/></model>',
                hash: '12345',
            });
            const recordA = {
                draft: false,
                enketoId,
                files: [],
                instanceId: 'a',
                name: 'name A',
                xml: '<model><something>a</something></model>',
            };
            const recordB = {
                draft: true,
                enketoId,
                files: [],
                instanceId: 'b',
                name: 'name B',
                xml: '<model><something>b</something></model>',
            };

            records
                .init()
                .then(() => store.survey.set(survey))
                .then(() => encryptor.encryptRecord(form, recordA))
                .then((encryptedRecordA) =>
                    records.save('set', encryptedRecordA)
                )
                .then(() => getLastSavedRecord(enketoId))
                .then(() => encryptor.encryptRecord(form, recordB))
                .then((encryptedRecordB) =>
                    records.save('set', encryptedRecordB)
                )
                .then(() => getLastSavedRecord(enketoId))
                .then((record) => {
                    expect(record).to.equal(undefined);
                })
                .then(done, done);
        });
    });

    describe('editing encrypted forms with unchanged media', () => {
        const form = {
            id: 'editForm',
            version: '1',
            encryptionKey:
                'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5s9p+VdyX1ikG8nnoXLCC9hKfivAp/e1sHr3O15UQ+a8CjR/QV29+cO8zjS/KKgXZiOWvX+gDs2+5k9Kn4eQm5KhoZVw5Xla2PZtJESAd7dM9O5QrqVJ5Ukrq+kG/uV0nf6X8dxyIluNeCK1jE55J5trQMWT2SjDcj+OVoTdNGJ1H6FL+Horz2UqkIObW5/elItYF8zUZcO1meCtGwaPHxAxlvODe8JdKs3eMiIo9eTT4WbH1X+7nJ21E/FBd8EmnK/91UGOx2AayNxM0RN7pAcj47a434LzeM+XCnBztd+mtt1PSflF2CFE116ikEgLcXCj4aklfoON9TwDIQSp0wIDAQAB',
        };

        /**
         * Helper to convert a string filename to a Blob by fetching via fileManager.
         * This simulates what controller-webform._convertFilesToBlobs does.
         */
        async function convertFileToBlob(filename) {
            const url = await fileManager.getFileUrl(filename);
            if (url.startsWith('data:') || url.startsWith('blob:')) {
                const response = await fetch(url);
                const blob = await response.blob();
                blob.name = filename;
                return blob;
            }
            const { item } = await connection.getMediaFile(url);
            item.name = filename;
            return item;
        }

        it('succeeds when unchanged media files are converted from filenames to Blobs via data URI', async () => {
            // Simulate: getCurrentFiles() returns string filename for unchanged file
            const unchangedFilename = 'existing-photo.jpg';
            const fileContent = 'existing image content';
            const dataUri = `data:image/jpeg;base64,${btoa(fileContent)}`;

            sandbox
                .stub(fileManager, 'getFileUrl')
                .withArgs(unchangedFilename)
                .resolves(dataUri);

            // Convert string filename to Blob (as the fix does)
            const convertedFile = await convertFileToBlob(unchangedFilename);

            expect(convertedFile).to.be.an.instanceof(Blob);
            expect(convertedFile.name).to.equal(unchangedFilename);

            // Now encrypt with the converted Blob
            const record = {
                xml: '<root>edited submission</root>',
                instanceId: 'edit-instance-1',
                files: [convertedFile],
            };

            const encryptedRecord = await encryptor.encryptRecord(form, record);

            const doc = new DOMParser().parseFromString(
                encryptedRecord.xml,
                'text/xml'
            );
            expect(doc.querySelectorAll('data > media').length).to.equal(1);
            expect(
                doc.querySelector('data > media > file').textContent
            ).to.equal('existing-photo.jpg.enc');
        });

        it('succeeds when unchanged media files are converted from filenames to Blobs via remote URL', async () => {
            const unchangedFilename = 'server-photo.png';
            const remoteUrl = 'https://example.com/media/server-photo.png';
            const fileContent = 'remote image content';
            const remoteBlob = new Blob([fileContent], { type: 'image/png' });

            sandbox
                .stub(fileManager, 'getFileUrl')
                .withArgs(unchangedFilename)
                .resolves(remoteUrl);
            sandbox
                .stub(connection, 'getMediaFile')
                .withArgs(remoteUrl)
                .resolves({ url: remoteUrl, item: remoteBlob });

            const convertedFile = await convertFileToBlob(unchangedFilename);

            expect(convertedFile).to.be.an.instanceof(Blob);
            expect(convertedFile.name).to.equal(unchangedFilename);

            const record = {
                xml: '<root>edited submission with remote file</root>',
                instanceId: 'edit-instance-2',
                files: [convertedFile],
            };

            const encryptedRecord = await encryptor.encryptRecord(form, record);

            const doc = new DOMParser().parseFromString(
                encryptedRecord.xml,
                'text/xml'
            );
            expect(doc.querySelectorAll('data > media').length).to.equal(1);
            expect(
                doc.querySelector('data > media > file').textContent
            ).to.equal('server-photo.png.enc');
        });

        it('succeeds with mixed new Blobs and converted unchanged files', async () => {
            // New file added during edit (already a Blob)
            const newFile = new Blob(['new photo content'], {
                type: 'image/png',
            });
            newFile.name = 'new-photo.png';

            // Unchanged file from original submission (string filename)
            const unchangedFilename = 'original-photo.jpg';
            const originalContent = 'original image content';
            const dataUri = `data:image/jpeg;base64,${btoa(originalContent)}`;

            sandbox
                .stub(fileManager, 'getFileUrl')
                .withArgs(unchangedFilename)
                .resolves(dataUri);

            const convertedUnchangedFile =
                await convertFileToBlob(unchangedFilename);

            const record = {
                xml: '<root>edited with new and existing media</root>',
                instanceId: 'edit-instance-3',
                files: [newFile, convertedUnchangedFile],
            };

            const encryptedRecord = await encryptor.encryptRecord(form, record);

            const doc = new DOMParser().parseFromString(
                encryptedRecord.xml,
                'text/xml'
            );
            expect(doc.querySelectorAll('data > media').length).to.equal(2);
            const fileElements = doc.querySelectorAll('data > media > file');
            expect(fileElements[0].textContent).to.equal('new-photo.png.enc');
            expect(fileElements[1].textContent).to.equal(
                'original-photo.jpg.enc'
            );
        });

        it('succeeds when all media files are unchanged (all converted from filenames)', async () => {
            const filename1 = 'photo1.jpg';
            const filename2 = 'photo2.png';
            const content1 = 'content1';
            const content2 = 'content2';

            const getFileUrlStub = sandbox.stub(fileManager, 'getFileUrl');
            getFileUrlStub
                .withArgs(filename1)
                .resolves(`data:image/jpeg;base64,${btoa(content1)}`);
            getFileUrlStub
                .withArgs(filename2)
                .resolves(`data:image/png;base64,${btoa(content2)}`);

            const convertedFile1 = await convertFileToBlob(filename1);
            const convertedFile2 = await convertFileToBlob(filename2);

            const record = {
                xml: '<root>edit with no media changes</root>',
                instanceId: 'edit-instance-4',
                files: [convertedFile1, convertedFile2],
            };

            const encryptedRecord = await encryptor.encryptRecord(form, record);

            const doc = new DOMParser().parseFromString(
                encryptedRecord.xml,
                'text/xml'
            );
            expect(doc.querySelectorAll('data > media').length).to.equal(2);
            expect(encryptedRecord.files.length).to.equal(3); // 2 media + submission.xml.enc
        });
    });
});
