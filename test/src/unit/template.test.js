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
const chaiAsPromised = require('chai-as-promised');
const fs = require('fs-extra');
const path = require('path');
const rewire = require('rewire');

const Templates = rewire('../../../src/pfe/portal/modules/Templates');
const {
    styledTemplates,
    defaultCodewindTemplates,
    defaultRepoList,
    sampleRepos,
} = require('../../modules/template.service');
const { suppressLogOutput } = require('../../modules/log.service');

chai.use(chaiAsPromised);
chai.should();
const testWorkspaceDir = './src/unit/temp/';
const testWorkspaceConfigDir = path.join(testWorkspaceDir, '.config/');

const sampleCodewindTemplate = styledTemplates.codewind;
const sampleAppsodyTemplate = styledTemplates.appsody;

const mockRepos = {
    enabled: {
        url: '1',
        description: '1',
        enabled: true,
    },
    disabled: {
        url: '2',
        description: '2',
        enabled: false,
    },
    noEnabledStatus: {
        url: '3',
        description: '3',
    },
};
const mockRepoList = Object.values(mockRepos);

describe('Templates.js', function() {
    suppressLogOutput(Templates);
    describe('getTemplateStyles() when Codewind is aware of:', function() {
        describe('Codewind and Appsody templates', function() {
            const sampleTemplateList = [
                sampleCodewindTemplate,
                sampleAppsodyTemplate,
            ];
            let templateController;
            before(() => {
                templateController = new Templates('');
                templateController.projectTemplates = sampleTemplateList;
                templateController.needsRefresh = false;
            });
            it(`returns ['Codewind', 'Appsody']`, async function() {
                const output = await templateController.getTemplateStyles();
                output.should.deep.equal(['Codewind', 'Appsody']);
            });
        });
        describe('only Codewind templates', function() {
            const sampleTemplateList = [sampleCodewindTemplate];
            let templateController;
            before(() => {
                templateController = new Templates('');
                templateController.projectTemplates = sampleTemplateList;
                templateController.needsRefresh = false;
            });
            it(`returns ['Codewind']`, async function() {
                const output = await templateController.getTemplateStyles();
                output.should.deep.equal(['Codewind']);
            });
        });
        describe('only Appsody templates', function() {
            const sampleTemplateList = [sampleAppsodyTemplate];
            let templateController;
            before(() => {
                templateController = new Templates('');
                templateController.projectTemplates = sampleTemplateList;
                templateController.needsRefresh = false;
            });
            it(`returns ['Appsody']`, async function() {
                const output = await templateController.getTemplateStyles();
                output.should.deep.equal(['Appsody']);
            });
        });
    });
    describe('getAllTemplates()', function() {
        describe(`when we don't refresh`, function() {
            const sampleTemplateList = [sampleAppsodyTemplate];
            let templateController;
            before(() => {
                templateController = new Templates('');
                templateController.projectTemplates = sampleTemplateList;
                templateController.needsRefresh = false;
            });
            it('returns the templates we inserted', async function() {
                const output = await templateController.getAllTemplates();
                output.should.deep.equal(sampleTemplateList);
            });
        });
        describe(`when we do refresh`, function() {
            describe('', function() {
                it('returns the default Codewind templates', async function() {
                    const templateController = new Templates('');
                    const output = await templateController.getAllTemplates();
                    output.should.deep.equal(defaultCodewindTemplates);
                });
            });
            describe('and add an extra template repo', function() {
                let templateController;
                before(() => {
                    templateController = new Templates('');
                    templateController.repositoryList = [
                        sampleRepos.codewind,
                        sampleRepos.appsody,
                    ];
                });
                it('returns more templates', async function() {
                    const output = await templateController.getAllTemplates();
                    output.should.include.deep.members(defaultCodewindTemplates);
                    (output.length).should.be.above(defaultCodewindTemplates.length);
                });
            });
            describe('and add an extra bad template repo', function() {
                let templateController;
                before(() => {
                    templateController = new Templates('');
                    templateController.repositoryList = [
                        sampleRepos.codewind,
                        { url: 'https://www.google.com/' },
                    ];
                });
                it('returns only the default templates', async function() {
                    const output = await templateController.getAllTemplates();
                    output.should.deep.equal(defaultCodewindTemplates);
                });
            });
        });
    });
    describe('getReposFromExtensions(extensions)', function() {
        const tests = {
            'invalid extension: string': {
                input: ['string'],
                output: [],
            },
            'invalid extension: empty obj': {
                input: [{}],
                output: [],
            },
            'extension provides non-array': {
                input: [{
                    getRepositories() {
                        return 'should be array';
                    },
                }],
                output: [],
            },
            'extension provides a repo with URL': {
                input: [{
                    getRepositories() {
                        return [{
                            url: 'https://www.google.com/',
                            description: 'not a GitHub repo',
                        }];
                    },
                }],
                output: [{
                    url: 'https://www.google.com/',
                    description: 'not a GitHub repo',
                }],
            },
        };
        for (const [testName, test] of Object.entries(tests)) {
            describe(testName, function() {
                it(`returns the expected repos`, async function() {
                    const output = await Templates.getReposFromExtensions(test.input);
                    output.should.deep.equal(test.output);
                });
            });
        }
    });
    describe('getTemplatesFromRepo(repository)', function() {
        describe('(<validRepository>)', function() {
            it('returns the correct templates', async function() {
                const output = await Templates.getTemplatesFromRepo(sampleRepos.codewind);
                output.should.have.deep.members(defaultCodewindTemplates);
            });
        });
        describe('(<invalidRepository>)', function() {
            describe('string', function() {
                it('throws a useful error', function() {
                    const func = () => Templates.getTemplatesFromRepo('string');
                    return func().should.be.rejectedWith(`repo 'string' must have a URL`);
                });
            });
            describe('invalid URL', function() {
                it('throws a useful error', function() {
                    const func = () => Templates.getTemplatesFromRepo({ url: 'invalidURL' });
                    return func().should.be.rejectedWith('Invalid URL');
                });
            });
            describe(`valid URL that doesn't provide JSON`, function() {
                it('throws a useful error', function() {
                    const func = () => Templates.getTemplatesFromRepo({ url: 'https://www.google.com/' });
                    return func().should.be.rejectedWith(`URL 'https://www.google.com/' should return JSON`);
                });
            });
        });
    });
    describe('getTemplatesFromRepos(repositoryList)', function() {
        describe('(undefined)', function() {
            it('throws an error', function() {
                const templateController = new Templates('');
                const func = () => templateController.getTemplatesFromRepos();
                return func().should.be.rejected;
            });
        });
        describe('([])', function() {
            it('returns no templates ([])', async function() {
                const templateController = new Templates('');
                const output = await templateController.getTemplatesFromRepos([]);
                output.should.deep.equal([]);
            });
        });
        describe('(<defaultRepoList>)', function() {
            describe('when we have no extensions', function() {
                it('returns the default Codewind templates', async function() {
                    const templateController = new Templates('');
                    const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                    output.should.deep.equal(defaultCodewindTemplates);
                });
            });
            describe(`when extensions don't provide repo lists`, function() {
                let templateController;
                before(() => {
                    templateController = new Templates('');
                    templateController.addExtension('should provide array', {
                        getRepositories() { return 'should be array'; },
                    });
                });
                it('still returns the default Codewind templates (ignoring the invalid extensions)', async function() {
                    const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                    output.should.deep.equal(defaultCodewindTemplates);
                });
            });
            describe('when extensions list invalid repos', function() {
                describe('wrong type', function() {
                    let templateController;
                    before(() => {
                        templateController = new Templates('');
                        templateController.addExtension('wrong type', {
                            getRepositories() { return ['should be object']; },
                        });
                    });
                    it('still returns the default Codewind templates (ignoring the invalid repos)', async function() {
                        const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                        output.should.deep.equal(defaultCodewindTemplates);
                    });
                });
                describe('missing URL', function() {
                    let templateController;
                    before(() => {
                        templateController = new Templates('');
                        templateController.addExtension('missing URL', {
                            getRepositories() {
                                return [{ description: 'missing URL' }];
                            },
                        });
                    });
                    it('still returns the default Codewind templates (ignoring the invalid repos)', async function() {
                        const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                        output.should.deep.equal(defaultCodewindTemplates);
                    });
                });
                describe('invalid URL', function() {
                    let templateController;
                    before(() => {
                        templateController = new Templates('');
                        templateController.addExtension('invalid URL', {
                            getRepositories() {
                                return [{
                                    description: 'invalid URL',
                                    url: 'invalid',
                                }];
                            },
                        });
                    });
                    it('still returns the default Codewind templates (ignoring the invalid repos)', async function() {
                        const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                        output.should.deep.equal(defaultCodewindTemplates);
                    });
                });
                describe('duplicate URL', function() {
                    let templateController;
                    before(() => {
                        templateController = new Templates('');
                        templateController.addExtension('duplicate URL', {
                            getRepositories() {
                                return [{
                                    description: 'duplicate URL',
                                    url: templateController.repositoryList[0].url,
                                }];
                            },
                        });
                    });
                    it('still returns the default Codewind templates (ignoring the invalid repos)', async function() {
                        const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                        output.should.deep.equal(defaultCodewindTemplates);
                    });
                });
                describe(`valid URL that doesn't provide JSON`, function() {
                    let templateController;
                    before(() => {
                        templateController = new Templates('');
                        templateController.addExtension(`doesn't provide JSON`, {
                            getRepositories() {
                                return [{
                                    url: 'https://www.google.com/',
                                    description: `doesn't provide JSON`,
                                }];
                            },
                        });
                    });
                    it('still returns the default Codewind templates (ignoring the invalid repos)', async function() {
                        const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                        output.should.deep.equal(defaultCodewindTemplates);
                    });
                });
            });
            describe('when extensions list valid repos', function() {
                let templateController;
                before(() => {
                    templateController = new Templates('');
                    templateController.addExtension('valid repo', {
                        getRepositories() {
                            return [{
                                url: 'https://raw.githubusercontent.com/kabanero-io/codewind-templates/aad4bafc14e1a295fb8e462c20fe8627248609a3/devfiles/index.json',
                                description: 'valid repo',
                            }];
                        },
                    });
                });
                it(`returns the default Codewind templates and the extension's templates`, async function() {
                    const output = await templateController.getTemplatesFromRepos(defaultRepoList);
                    output.should.include.deep.members(defaultCodewindTemplates);
                    (output.length).should.be.above(defaultCodewindTemplates.length);
                });
            });
        });
    });
    describe('addRepository(repoUrl, repoDescription)', function() {
        let templateController;
        beforeEach(() => {
            fs.ensureDirSync(testWorkspaceConfigDir);
            templateController = new Templates(testWorkspaceDir);
            templateController.repositoryList = [...mockRepoList];
        });
        afterEach(() => {
            fs.removeSync(testWorkspaceDir);
        });
        describe('(<existingUrl>, <validDesc>)', function() {
            it('throws an error', function() {
                const { url, description } = mockRepoList[0];
                const func = () => templateController.addRepository(url, description);
                return func().should.be.rejectedWith(`${1} is not a unique URL. Repository URLs must be unique`);
            });
        });
        describe('(<uniqueString>, <validDesc>)', function() {
            it('succeeds', async function() {
                const func = () => templateController.addRepository('unique string', 'description');
                await (func().should.not.be.rejected);
                templateController.repositoryList.should.deep.include({
                    url: 'unique string',
                    description: 'description',
                    enabled: true,
                });
            });
        });
    });
    describe('getRepositories()', function() {
        let templateController;
        before(() => {
            templateController = new Templates('');
            templateController.repositoryList = [...mockRepoList];
        });
        it('returns all repos', function() {
            const output = templateController.getRepositories();
            output.should.deep.equal(mockRepoList);
        });
    });
    describe('getEnabledRepositories()', function() {
        let templateController;
        before(() => {
            templateController = new Templates('');
            templateController.repositoryList = [mockRepos.enabled, mockRepos.disabled];
        });
        it('returns only enabled repos', function() {
            const output = templateController.getEnabledRepositories();
            output.should.deep.equal([mockRepos.enabled]);
        });
    });
    describe('enableRepository(url)', function() {
        let templateController;
        beforeEach(() => {
            templateController = new Templates('');
            templateController.repositoryList = [...mockRepoList];
        });
        describe('(existing url)', function() {
            it('enables the correct repo', function() {
                templateController.enableRepository(mockRepos.disabled.url);
                const expectedRepoDetails = {
                    ...mockRepos.disabled,
                    enabled: true,
                };
                templateController.getRepositories().should.deep.include(expectedRepoDetails);
            });
        });
        describe('(non-existent url)', function() {
            it('throws a useful error', function() {
                const func = () => templateController.enableRepository('non-existent');
                func.should.throw(`no repository found with URL 'non-existent'`);
            });
        });
    });
    describe('disableRepository(url)', function() {
        let templateController;
        beforeEach(() => {
            templateController = new Templates('');
            templateController.repositoryList = [...mockRepoList];
        });
        describe('(existing url)', function() {
            it('disables the correct repo', function() {
                const repo = { ...templateController.repositoryList[0] };
                templateController.disableRepository(repo.url);
                const expectedRepoDetails = {
                    ...repo,
                    enabled: false,
                };
                templateController.getRepositories().should.deep.include(expectedRepoDetails);
            });
        });
        describe('(non-existent url)', function() {
            it('throws a useful error', function() {
                const func = () => templateController.disableRepository('non-existent');
                func.should.throw(`no repository found with URL 'non-existent'`);
            });
        });
    });
    describe('initializeExtensionSettings()', function() {
        describe('when the file already exists', function() {
            let templateController;
            beforeEach(() => {
                fs.ensureDirSync(testWorkspaceConfigDir);
                templateController = new Templates(testWorkspaceDir);
                fs.writeJSONSync(templateController.extensionSettingsFile, [
                    {
                        name: '1',
                        description: '1',
                        enabled: true,
                    },
                ]);
                templateController.extensions = {
                    1: {
                        enabled: false,
                    },
                };
            });
            afterEach(() => {
                fs.removeSync(testWorkspaceDir);
            });
            it(`correctly reads the extension settings file`, async function() {
                await templateController.initializeExtensionSettings();

                templateController.extensions.should.deep.equal({
                    1: {
                        enabled: true,
                    },
                });
            });
        });
        describe(`when the file doesn't already exist`, function() {
            let templateController;
            beforeEach(() => {
                fs.ensureDirSync(testWorkspaceConfigDir);
                templateController = new Templates(testWorkspaceDir);
                templateController.extensions = {
                    1: {
                        enabled: false,
                    },
                };
            });
            afterEach(() => {
                fs.removeSync(testWorkspaceDir);
            });
            it(`correctly reads the extension settings file`, async function() {
                await templateController.initializeExtensionSettings();

                const settingsFile = fs.readJSONSync(templateController.extensionSettingsFile);
                settingsFile.should.deep.equal([
                    {
                        name: '1',
                        description: '1',
                        enabled: false,
                    },
                ]);
            });


        });
    });

    describe('batchUpdateExtensions(requestedOperations)', function() {
        const tests = {
            'enable 2 existing extensions': {
                input: [
                    {
                        op: 'enable',
                        name: '1',
                        value: 'true',
                    },
                    {
                        op: 'enable',
                        name: '2',
                        value: 'true',
                    },
                ],
                output: [
                    {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            name: '1',
                            value: 'true',
                        },
                    },
                    {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            name: '2',
                            value: 'true',
                        },
                    },
                ],
                expectedExtensionDetails: [
                    {
                        name: '1',
                        description: '1',
                        enabled: true,
                    },
                    {
                        name: '2',
                        description: '2',
                        enabled: true,
                    },
                ],
            },
            'disable 2 existing extensions': {
                input: [
                    {
                        op: 'enable',
                        name: '1',
                        value: 'false',
                    },
                    {
                        op: 'enable',
                        name: '2',
                        value: 'false',
                    },
                ],
                output: [
                    {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            name: '1',
                            value: 'false',
                        },
                    },
                    {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            name: '2',
                            value: 'false',
                        },
                    },
                ],
                expectedExtensionDetails: [
                    {
                        name: '1',
                        description: '1',
                        enabled: false,
                    },
                    {
                        name: '2',
                        description: '2',
                        enabled: false,
                    },
                ],
            },
            'enable an unknown extension': {
                input: [
                    {
                        op: 'enable',
                        name: '1',
                        value: 'false',
                    },
                    {
                        op: 'enable',
                        name: '2',
                        value: 'false',
                    },
                ],
                output: [
                    {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            name: '1',
                            value: 'false',
                        },
                    },
                    {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            name: '2',
                            value: 'false',
                        },
                    },
                ],
                expectedExtensionDetails: [
                    {
                        name: '1',
                        description: '1',
                        enabled: false,
                    },
                    {
                        name: '2',
                        description: '2',
                        enabled: false,
                    },
                ],
            },
            'enable an unknown extension': {
                input: [
                    {
                        op: 'enable',
                        name: 'unknownExtensionName',
                        value: 'true',
                    },
                ],
                output: [
                    {
                        status: 404,
                        error: 'Unknown extension name',
                        requestedOperation: {
                            op: 'enable',
                            name: 'unknownExtensionName',
                            value: 'true',
                        },
                    },
                ],
            },
            'disable an unknown extension': {
                input: [
                    {
                        op: 'enable',
                        name: 'unknownExtensionName',
                        value: 'false',
                    },
                ],
                output: [
                    {
                        status: 404,
                        error: 'Unknown extension name',
                        requestedOperation: {
                            op: 'enable',
                            name: 'unknownExtensionName',
                            value: 'false',
                        },
                    },
                ],
            },
            'disable an existing extension and an unknown extension': {
                input: [
                    {
                        op: 'enable',
                        name: '1',
                        value: 'false',
                    },
                    {
                        op: 'enable',
                        name: 'unknownExtensionName',
                        value: 'false',
                    },
                ],
                output: [
                    {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            name: '1',
                            value: 'false',
                        },
                    },
                    {
                        status: 404,
                        error: 'Unknown extension name',
                        requestedOperation: {
                            op: 'enable',
                            name: 'unknownExtensionName',
                            value: 'false',
                        },
                    },
                ],
                expectedExtensionDetails: [
                    {
                        name: '1',
                        description: '1',
                        enabled: false,
                    },
                ],
            },
        };
        let templateController;
        beforeEach(() => {
            fs.ensureDirSync(testWorkspaceConfigDir);
            templateController = new Templates(testWorkspaceDir);
            templateController.extensions = {
                1: {
                    enabled: true,
                },
                2: {
                    enabled: false,
                },
            };
        });
        afterEach(() => {
            fs.removeSync(testWorkspaceDir);
        });
        for (const [testName, test] of Object.entries(tests)) {
            describe(testName, function() { // eslint-disable-line no-loop-func
                it(`returns the expected operation info and correctly updates the extension settings file`, async function() {
                    const output = await templateController.batchUpdateExtensions(test.input);
                    output.should.deep.equal(test.output);

                    if (test.expectedExtensionDetails) {
                        const extensionSettingsFile = fs.readJsonSync(templateController.extensionSettingsFile);
                        extensionSettingsFile.should.include.deep.members(test.expectedExtensionDetails);
                    }
                });
            });
        }
    });
    describe('batchUpdateRepos(requestedOperations)', function() {
        let templateController;
        beforeEach(() => {
            fs.ensureDirSync(testWorkspaceConfigDir);
            templateController = new Templates(testWorkspaceDir);
            templateController.repositoryList = [...mockRepoList];
        });
        afterEach(() => {
            fs.removeSync(testWorkspaceDir);
        });
        describe('when the requested operations are all valid', function() {
            const tests = {
                'enable 2 existing repos': {
                    input: [
                        {
                            op: 'enable',
                            url: '1',
                            value: 'true',
                        },
                        {
                            op: 'enable',
                            url: '2',
                            value: 'true',
                        },
                    ],
                    output: [
                        {
                            status: 200,
                            requestedOperation: {
                                op: 'enable',
                                url: '1',
                                value: 'true',
                            },
                        },
                        {
                            status: 200,
                            requestedOperation: {
                                op: 'enable',
                                url: '2',
                                value: 'true',
                            },
                        },
                    ],
                    expectedRepoDetails: [
                        {
                            url: '1',
                            description: '1',
                            enabled: true,
                        },
                        {
                            url: '2',
                            description: '2',
                            enabled: true,
                        },
                    ],
                },
                'disable 2 existing repos': {
                    input: [
                        {
                            op: 'enable',
                            url: '1',
                            value: 'false',
                        },
                        {
                            op: 'enable',
                            url: '2',
                            value: 'false',
                        },
                    ],
                    output: [
                        {
                            status: 200,
                            requestedOperation: {
                                op: 'enable',
                                url: '1',
                                value: 'false',
                            },
                        },
                        {
                            status: 200,
                            requestedOperation: {
                                op: 'enable',
                                url: '2',
                                value: 'false',
                            },
                        },
                    ],
                    expectedRepoDetails: [
                        {
                            url: '1',
                            description: '1',
                            enabled: false,
                        },
                        {
                            url: '2',
                            description: '2',
                            enabled: false,
                        },
                    ],
                },
                'enable an unknown repo': {
                    input: [
                        {
                            op: 'enable',
                            url: '1',
                            value: 'false',
                        },
                        {
                            op: 'enable',
                            url: '2',
                            value: 'false',
                        },
                    ],
                    output: [
                        {
                            status: 200,
                            requestedOperation: {
                                op: 'enable',
                                url: '1',
                                value: 'false',
                            },
                        },
                        {
                            status: 200,
                            requestedOperation: {
                                op: 'enable',
                                url: '2',
                                value: 'false',
                            },
                        },
                    ],
                    expectedRepoDetails: [
                        {
                            url: '1',
                            description: '1',
                            enabled: false,
                        },
                        {
                            url: '2',
                            description: '2',
                            enabled: false,
                        },
                    ],
                },
                'enable an unknown repo': {
                    input: [
                        {
                            op: 'enable',
                            url: 'unknownRepoUrl',
                            value: 'true',
                        },
                    ],
                    output: [
                        {
                            status: 404,
                            error: 'Unknown repository URL',
                            requestedOperation: {
                                op: 'enable',
                                url: 'unknownRepoUrl',
                                value: 'true',
                            },
                        },
                    ],
                },
                'disable an unknown repo': {
                    input: [
                        {
                            op: 'enable',
                            url: 'unknownRepoUrl',
                            value: 'false',
                        },
                    ],
                    output: [
                        {
                            status: 404,
                            error: 'Unknown repository URL',
                            requestedOperation: {
                                op: 'enable',
                                url: 'unknownRepoUrl',
                                value: 'false',
                            },
                        },
                    ],
                },
                'disable an existing repo and an unknown repo': {
                    input: [
                        {
                            op: 'enable',
                            url: '1',
                            value: 'false',
                        },
                        {
                            op: 'enable',
                            url: 'unknownRepoUrl',
                            value: 'false',
                        },
                    ],
                    output: [
                        {
                            status: 200,
                            requestedOperation: {
                                op: 'enable',
                                url: '1',
                                value: 'false',
                            },
                        },
                        {
                            status: 404,
                            error: 'Unknown repository URL',
                            requestedOperation: {
                                op: 'enable',
                                url: 'unknownRepoUrl',
                                value: 'false',
                            },
                        },
                    ],
                    expectedRepoDetails: [
                        {
                            url: '1',
                            description: '1',
                            enabled: false,
                        },
                    ],
                },
            };
            for (const [testName, test] of Object.entries(tests)) {
                describe(testName, function() { // eslint-disable-line no-loop-func
                    it(`returns the expected operation info and correctly updates the repository file`, async function() {
                        const output = await templateController.batchUpdateRepos(test.input);
                        output.should.deep.equal(test.output);

                        if (test.expectedRepoDetails) {
                            const repoFile = fs.readJsonSync(templateController.repositoryFile);
                            repoFile.should.include.deep.members(test.expectedRepoDetails);
                        }
                    });
                });
            }
        });
    });
    describe('operateOnRepo(operation)', function() {
        let templateController;
        beforeEach(() => {
            templateController = new Templates('');
            templateController.repositoryList = [...mockRepoList];
        });
        describe('when `operation.url` is an existing url', function() {
            const tests = {
                'enable an existing repo': {
                    input: {
                        op: 'enable',
                        url: '1',
                        value: 'true',
                    },
                    output: {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            url: '1',
                            value: 'true',
                        },
                    },
                    expectedRepoDetails: {
                        url: '1',
                        description: '1',
                        enabled: true,
                    },
                },
                'disable an existing repo': {
                    input: {
                        op: 'enable',
                        url: '1',
                        value: 'false',
                    },
                    output: {
                        status: 200,
                        requestedOperation: {
                            op: 'enable',
                            url: '1',
                            value: 'false',
                        },
                    },
                    expectedRepoDetails: {
                        url: '1',
                        description: '1',
                        enabled: false,
                    },
                },
            };
            for (const [testName, test] of Object.entries(tests)) {
                describe(testName, function() { // eslint-disable-line no-loop-func
                    it(`returns the expected operation info and correctly updates the repository file`, function() {
                        const output = templateController.operateOnRepo(test.input);
                        output.should.deep.equal(test.output);
                    });
                });
            }
        });
        describe('when `operation.url` is an unknown url', function() {
            const tests = {
                'enable an unknown repo': {
                    input: {
                        op: 'enable',
                        url: 'unknownRepoUrl',
                        value: 'true',
                    },
                    output: {
                        status: 404,
                        error: 'Unknown repository URL',
                        requestedOperation: {
                            op: 'enable',
                            url: 'unknownRepoUrl',
                            value: 'true',
                        },
                    },
                },
                'disable an unknown repo': {
                    input: {
                        op: 'enable',
                        url: 'unknownRepoUrl',
                        value: 'false',
                    },
                    output: {
                        status: 404,
                        error: 'Unknown repository URL',
                        requestedOperation: {
                            op: 'enable',
                            url: 'unknownRepoUrl',
                            value: 'false',
                        },
                    },
                },
            };
            for (const [testName, test] of Object.entries(tests)) {
                describe(testName, function() { // eslint-disable-line no-loop-func
                    it(`returns the expected operation info`, function() {
                        const output = templateController.operateOnRepo(test.input);
                        output.should.deep.equal(test.output);
                    });
                });
            }
        });
    });
    describe('addExtension(name, extension)', function() {
        describe('invalid args', function() {
            describe('invalid extension type', function() {
                describe('empty object', function() {
                    it('ignores the invalid extension', function() {
                        const templateController = new Templates('');
                        const originalExtensions = { ...templateController.extensions };

                        templateController.addExtension('empty obj', {});

                        templateController.extensions.should.deep.equal(originalExtensions);
                    });
                });
            });
        });
    });

    describe('filterTemplatesByStyle(templates, projectStyle)', function() {
        const templates = [sampleCodewindTemplate, sampleAppsodyTemplate];
        describe(`projectStyle='Codewind'`, function() {
            it('returns only Codewind templates', function() {
                const output = Templates.filterTemplatesByStyle(templates, 'Codewind');
                output.should.deep.equal([sampleCodewindTemplate]);
            });
        });
        describe(`projectStyle='Appsody'`, function() {
            it('returns only Appsody templates', function() {
                const output = Templates.filterTemplatesByStyle(templates, 'Appsody');
                output.should.deep.equal([sampleAppsodyTemplate]);
            });
        });
    });
});
