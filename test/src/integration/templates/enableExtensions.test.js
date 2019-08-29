/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
const chai = require('chai');

const {
    getTemplates,
    setTemplateReposTo,
    sampleExtensions,
    getTemplateExtensions,
    enableTemplateExtensions,
    disableTemplateExtensions,
    setTemplateExtensionsTo,
    saveExtensionsBeforeTestAndRestoreAfter,
    saveReposBeforeTestAndRestoreAfter,
} = require('../../../modules/template.service');

chai.should();


describe('Batch enabling extensions', function() {
    const tests = {
        '1 extension': {
            testExtensions: [{ ...sampleExtensions.appsody }],
        },
    };

    for (const [testName, test] of Object.entries(tests)) {
        describe(testName, function() { // eslint-disable-line no-loop-func
            const { testExtensions } = test;
            let templatesFromTestExtensions;
            saveExtensionsBeforeTestAndRestoreAfter();
            saveReposBeforeTestAndRestoreAfter();
            before(async() => {
                await setTemplateExtensionsTo(testExtensions);
                await setTemplateReposTo([]);

                const res = await getTemplates();
                templatesFromTestExtensions = res.body;
            });
            it(`returns 207 and sub-status 200 for each subrequest when batch disabling ${testExtensions.length} extensions`, async function() {
                const extensionNames = testExtensions.map(extension => extension.name);
                const res = await disableTemplateExtensions(extensionNames);

                res.should.have.status(207);
                res.body.forEach(subResponse =>
                    subResponse.status.should.equal(200)
                );
            });
            it(`lists those extensions as disabled`, async function() {
                const disabledExtensions = testExtensions.map(extension => {
                    return {
                        ...extension,
                        enabled: false,
                    };
                });

                const res = await getTemplateExtensions();

                res.should.have.status(200);
                res.body.should.have.deep.members(disabledExtensions);
            });
            it(`checks templates from the disabled extensions do not appear in the list of enabled templates`, async function() {
                const res = await getTemplates({ showEnabledOnly: true });
                res.should.have.status(204);
            });

            it(`returns 207 and sub-status 200 for each subrequest when batch enabling ${testExtensions.length} extensions`, async function() {
                const extensionNames = testExtensions.map(extension => extension.name);
                const res = await enableTemplateExtensions(extensionNames);

                res.should.have.status(207);
                res.body.forEach(subResponse =>
                    subResponse.status.should.equal(200)
                );
            });
            it(`lists those extensions as enabled`, async function() {
                const enabledExtensions = testExtensions.map(extension => {
                    return {
                        ...extension,
                        enabled: true,
                    };
                });

                const res = await getTemplateExtensions();

                res.should.have.status(200);
                res.body.should.have.deep.members(enabledExtensions);
            });
            it(`checks templates from the enabled extensions do appear in the list of enabled templates`, async function() {
                const res = await getTemplates({ showEnabledOnly: true });
                res.should.have.status(200);
                res.body.should.have.deep.members(templatesFromTestExtensions);
            });
        });
    }
});
