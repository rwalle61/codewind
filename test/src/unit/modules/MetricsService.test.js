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
const deepEqualInAnyOrder = require('deep-equal-in-any-order');
const fs = require('fs-extra');
const path = require('path');
const rewire = require('rewire');
const xml2js = require('xml2js');

const metricsService = rewire('../../../../src/pfe/portal/modules/MetricsService');

chai.use(chaiAsPromised);
chai.use(deepEqualInAnyOrder);
chai.should();

describe('MetricsService.js', () => {
    const projectDir = path.join('.', 'src', 'unit', 'modules');

    // nodejs
    const pathToPackageJson = path.join(projectDir, 'package.json');
    const originalPackageJson = {
        /* eslint-disable quote-props, quotes, comma-dangle */
        "name": "node",
        "version": "1.0.0",
        "description": "A generated IBM Cloud application",
        "scripts": {
            "start": "node $npm_package_config_entrypoint",
            "debug": "node --inspect=0.0.0.0:9229 $npm_package_config_entrypoint"
        },
        "dependencies": {
            "body-parser": "^1.18.3",
            "express": "^4.16.4"
        }
        /* eslint-enable quote-props, quotes, comma-dangle */
    };

    const expectedPackageJson = {
        /* eslint-disable quote-props, quotes, comma-dangle */
        "name": "node",
        "version": "1.0.0",
        "description": "A generated IBM Cloud application",
        "scripts": {
            "start": "node -r appmetrics-prometheus/attach $npm_package_config_entrypoint",
            "debug": "node --inspect=0.0.0.0:9229 $npm_package_config_entrypoint"
        },
        "dependencies": {
            "body-parser": "^1.18.3",
            "express": "^4.16.4",
            "appmetrics-prometheus": "git+https://git@github.com/CloudNativeJS/appmetrics-prometheus.git#appmetrics-codewind",
            "cors": "^2.8.5"
        }
        /* eslint-enable quote-props, quotes, comma-dangle */
    };

    // liberty
    const pathToJvmOptions = path.join(projectDir, 'src', 'main', 'liberty', 'config', 'jvm.options');
    const originalJvmOptions = 'foobar';
    const expectedJvmOptions = `${originalJvmOptions}\n-javaagent:resources/javametrics-agent.jar`;

    const pathToTestPomXml = path.join(projectDir, 'pom.xml');

    const pathToTestResourcesDir = path.join('.', 'resources', 'metricsService');
    const pathToOriginalPomXml = path.join(pathToTestResourcesDir, 'pom without collector.xml');
    const pathToExpectedPomXml = path.join(pathToTestResourcesDir, 'pom with collector.xml');
    let originalPomXml;
    let expectedPomXml;

    before(async() => {
        originalPomXml = await readXml(pathToOriginalPomXml);
        expectedPomXml = await readXml(pathToExpectedPomXml);
    });

    describe('injectMetricsCollectorIntoProject(projectType, projectDir)', () => {
        describe(`('nodejs', <goodProjectDir>)`, () => {
            beforeEach(() => {
                fs.writeJSONSync(pathToPackageJson, originalPackageJson);
            });
            afterEach(() => {
                fs.unlinkSync(pathToPackageJson);
            });
            it(`injects metrics collector into the project's package.json`, async() => {
                await metricsService.injectMetricsCollectorIntoProject('nodejs', projectDir);

                fs.readJSONSync(pathToPackageJson).should.deep.equal(expectedPackageJson);
            });
        });
        describe(`('liberty', <goodProjectDir>)`, () => {
            beforeEach(() => {
                fs.writeFileSync(pathToTestPomXml, fs.readFileSync(pathToOriginalPomXml));
                fs.outputFileSync(pathToJvmOptions, originalJvmOptions);
            });
            afterEach(() => {
                fs.unlinkSync(pathToTestPomXml);
                fs.unlinkSync(pathToJvmOptions);
            });
            it(`injects metrics collector into the project's jvm.options and pom.xml`, async() => {
                const funcToTest = metricsService.__get__('injectMetricsCollectorIntoProject');
                await funcToTest('liberty', projectDir);

                const outputPomXml = await readXml(pathToTestPomXml);
                outputPomXml.should.deep.equalInAnyOrder(expectedPomXml);

                const outputJvmOptions = fs.readFileSync(pathToJvmOptions, 'utf8');
                outputJvmOptions.should.equal(expectedJvmOptions);
            });
        });
        describe(`('unsupportedProjectType', <goodProjectDir>)`, () => {
            beforeEach(() => {
                fs.writeJSONSync(pathToPackageJson, originalPackageJson);
            });
            afterEach(() => {
                fs.unlinkSync(pathToPackageJson);
            });
            it(`throws a useful error`, () => {
                const funcToTest = () => metricsService.injectMetricsCollectorIntoProject('unsupportedProjectType', projectDir);
                return funcToTest().should.be.rejectedWith(`Injection of metrics collector is not supported for projects of type 'unsupportedProjectType'`);
            });
        });
    });
    describe('nodejs', () => {
        describe('injectMetricsCollectorIntoNodeProject(projectDir)', () => {
            describe('package.json does not have metrics injection code', () => {
                before(() => {
                    fs.writeJSONSync(pathToPackageJson, originalPackageJson);
                });
                after(() => {
                    fs.unlinkSync(pathToPackageJson);
                });
                it(`injects metrics collector into the project's package.json`, async() => {
                    const funcToTest = metricsService.__get__('injectMetricsCollectorIntoNodeProject');
                    await funcToTest(projectDir);

                    fs.readJSONSync(pathToPackageJson).should.deep.equal(expectedPackageJson);
                });
            });
            describe('package.json already has metrics injection code', () => {
                before(() => {
                    fs.writeJSONSync(pathToPackageJson, expectedPackageJson);
                });
                after(() => {
                    fs.unlinkSync(pathToPackageJson);
                });
                it(`injects metrics collector into the project's package.json`, async() => {
                    const funcToTest = metricsService.__get__('injectMetricsCollectorIntoNodeProject');
                    await funcToTest(projectDir);

                    fs.readJSONSync(pathToPackageJson).should.deep.equal(expectedPackageJson);
                });
            });
        });
        describe('getNewContentsOfPackageJson(originalContents)', () => {
            it(`returns an object representing a package.json injected with metrics collector`, () => {
                const funcToTest = metricsService.__get__('getNewContentsOfPackageJson');
                const output = funcToTest(originalPackageJson);
                output.should.deep.equal(expectedPackageJson);
            });
        });
    });

    describe('liberty', () => {
        describe('injectMetricsCollectorIntoLibertyProject(projectDir)', () => {
            beforeEach(() => {
                fs.writeFileSync(pathToTestPomXml, fs.readFileSync(pathToOriginalPomXml));
                fs.outputFileSync(pathToJvmOptions, originalJvmOptions);
            });
            afterEach(() => {
                fs.unlinkSync(pathToTestPomXml);
                fs.unlinkSync(pathToJvmOptions);
            });
            it(`injects metrics collector into the project's jvm.options and pom.xml`, async() => {
                const funcToTest = metricsService.__get__('injectMetricsCollectorIntoLibertyProject');
                await funcToTest(projectDir);

                const outputPomXml = await readXml(pathToTestPomXml);
                outputPomXml.should.deep.equalInAnyOrder(expectedPomXml);

                const outputJvmOptions = fs.readFileSync(pathToJvmOptions, 'utf8');
                outputJvmOptions.should.equal(expectedJvmOptions);
            });
        });

        describe('injectMetricsCollectorIntoPomXml(pathToPomXml)', () => {
            beforeEach(() => {
                fs.writeFileSync(pathToTestPomXml, fs.readFileSync(pathToOriginalPomXml));
            });
            afterEach(() => {
                fs.unlinkSync(pathToTestPomXml);
            });
            it(`injects metrics collector into the project's pom.xml`, async() => {
                const funcToTest = metricsService.__get__('injectMetricsCollectorIntoPomXml');
                await funcToTest(pathToTestPomXml);

                const outputPomXml = await readXml(pathToTestPomXml);
                outputPomXml.should.deep.equalInAnyOrder(expectedPomXml);
            });
        });

        describe('injectMetricsCollectorIntoJvmOptions(pathToJvmOptions)', () => {
            beforeEach(() => {
                fs.outputFileSync(pathToJvmOptions, originalJvmOptions);
            });
            afterEach(() => {
                fs.unlinkSync(pathToJvmOptions);
            });
            it(`injects metrics collector into the project's pom.xml`, async() => {
                const funcToTest = metricsService.__get__('injectMetricsCollectorIntoJvmOptions');
                await funcToTest(pathToJvmOptions);

                const outputJvmOptions = fs.readFileSync(pathToJvmOptions, 'utf8');
                outputJvmOptions.should.equal(expectedJvmOptions);
            });
        });

        describe('getNewContentsOfJvmOptions(originalContents)', () => {
            it('returns an object representing a pom.xml injected with metrics collector', () => {
                const originalJvmOptions = 'foobar';
                const funcToTest = metricsService.__get__('getNewContentsOfJvmOptions');
                const output = funcToTest(originalJvmOptions);
                output.should.equal(expectedJvmOptions);
            });
        });

        describe('getNewContentsOfPomXml(originalContents)', () => {
            it('returns an object representing a pom.xml injected with metrics collector', () => {
                const funcToTest = metricsService.__get__('getNewContentsOfPomXml');
                const output = funcToTest(originalPomXml);
                output.should.deep.equalInAnyOrder(expectedPomXml);
            });
        });

        describe('getNewPomXmlDependencies(originalDependencies)', () => {
            const metricsCollectorDependency = {
                groupId: [ 'com.ibm.runtimetools' ],
                artifactId: [ 'javametrics-dash' ],
                version: [ '[1.2,2.0)' ],
                scope: [ 'provided' ],
                type: [ 'war' ],
            };
            describe(`<originalDependencies> don't include javametrics-dash`, () => {
            it(`returns an object representing pom.xml dependencies injected with metrics collector`, () => {
                const funcToTest = metricsService.__get__('getNewPomXmlDependencies');
                const originalDependencies = [];
                const output = funcToTest(originalDependencies);
                output.should.have.deep.members([
                    ...originalDependencies,
                        metricsCollectorDependency,
                ]);
            });
        });
            describe(`<originalDependencies> already include javametrics-dash`, () => {
                it(`returns an object representing the original pom.xml dependencies`, () => {
                    const funcToTest = metricsService.__get__('getNewPomXmlDependencies');
                    const originalDependencies = [metricsCollectorDependency];
                    const output = funcToTest(originalDependencies);
                    output.should.have.deep.members(originalDependencies);
                });
            });
        });
        describe('getNewPomXmlBuildPluginExecutions(originalBuildPluginExecutions)', () => {
            const metricsCollectorBuildPluginExecution = {
                        id: [ 'copy-javametrics-dash' ],
                        phase: [ 'package' ],
                        goals: [ { goal: [ 'copy-dependencies' ] } ],
                        configuration: [
                            {
                                stripVersion: [ 'true' ],
                                outputDirectory: [
                                    '${project.build.directory}/liberty/wlp/usr/servers/defaultServer/dropins',
                                ],
                                includeArtifactIds: [ 'javametrics-dash' ],
                            },
                        ],
            };
            describe(`<originalBuildPluginExecutions> don't include javametrics-dash`, () => {
                it(`returns an object representing pom.xml build plugin executions injected with metrics collector`, () => {
                    const funcToTest = metricsService.__get__('getNewPomXmlBuildPluginExecutions');
                    const originalBuildPluginExecutions = [];
                    const output = funcToTest(originalBuildPluginExecutions);
                    output.should.have.deep.members([
                        ...originalBuildPluginExecutions,
                        metricsCollectorBuildPluginExecution,
                ]);
            });
        });
            describe(`<originalBuildPluginExecutions> already include javametrics-dash`, () => {
                it(`returns an object representing the original pom.xml build plugin executions`, () => {
                    const funcToTest = metricsService.__get__('getNewPomXmlBuildPluginExecutions');
                    const originalBuildPluginExecutions = [metricsCollectorBuildPluginExecution];
                    const output = funcToTest(originalBuildPluginExecutions);
                    output.should.have.deep.members(originalBuildPluginExecutions);
                });
            });
        });
    });
});

async function readXml(pathToXmlFile) {
    const xmlFileData = fs.readFileSync(pathToXmlFile);
    const xmlAsJson = await xml2js.parseStringPromise(xmlFileData);
    return xmlAsJson;
}