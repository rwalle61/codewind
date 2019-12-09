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
const rewire = require('rewire');
const { mockReq, mockRes } = require('sinon-express-mock');

const projectsController = rewire('../../../../src/pfe/portal/controllers/projects.controller');
const ProjectList = require('../../../../src/pfe/portal/modules/ProjectList');

const { suppressLogOutput } = require('../../../modules/log.service');
const { createNodeProjectWithPackageJsonDependencies } = require('../../../modules/projectCreation.service');

chai.should();
const projectDir = './test';

describe('projects.controller.js', () => {
    suppressLogOutput(projectsController);
    describe('getProject(req, res)', () => {
        it('returns 404 if the specified project does not exist', async() => {
            const request = {
                sanitizeParams: () => 'nonexistentProjectId',
                cw_user: {
                    projectList: {
                        retrieveProject: () => {},
                    },
                },
            };
            const req = mockReq(request);
            const res = mockRes();

            await projectsController.getProject(req, res);

            res.sendStatus.should.be.calledOnceWith(404);
        });
        it('returns 500 if our server errors while parsing the request', async() => {
            const request = {};
            const req = mockReq(request);
            const res = mockRes();

            await projectsController.getProject(req, res);

            res.status.should.be.calledOnceWith(500);
            res.send.args[0][0].message.should.equal('req.sanitizeParams is not a function');
        });
        it('returns 200 and the project if the project ID is good', async() => {
            const projectList = new ProjectList();
            const project = createNodeProjectWithPackageJsonDependencies({}, projectDir, {});
            projectList.addProject(project);

            const request = {
                protocol: 'http',
                headers: { host: '127.0.0.1:10000' },
                sanitizeParams: () => project.projectID,
                cw_user: { projectList },
            };
            const req = mockReq(request);
            const res = mockRes();

            await projectsController.getProject(req, res);

            res.status.should.be.calledOnceWith(200);
            res.send.args[0][0].should.deep.include(project);
            res.send.args[0][0].appMonitorUrl.should.be.a('string');
        });
        it('returns 200 and the project with correct appMonitorUrl if the project ID is good and has the correct package.json', async() => {
            const projectList = new ProjectList();
            const packageJsonDependencies = {
                'appmetrics-dash': '^0.1.0',
            };
            const extraCreationArgs = {
                host: '127.0.0.1',
                port: { internalPort: 32777 },
            };
            const project = createNodeProjectWithPackageJsonDependencies(extraCreationArgs, projectDir, packageJsonDependencies);
            projectList.addProject(project);

            const request = {
                protocol: 'http',
                headers: { host: '127.0.0.1:10000' },
                sanitizeParams: () => project.projectID,
                cw_user: { projectList },
            };
            const req = mockReq(request);
            const res = mockRes();

            await projectsController.getProject(req, res);

            res.status.should.be.calledOnceWith(200);
            res.send.args[0][0].should.deep.include(project);
            res.send.args[0][0].appMonitorUrl.should.be.a('string');
        });
        it('returns 200 and the project with an appMonitorUrl', async() => {
            const projectList = new ProjectList();
            const packageJsonDependencies = {
                'appmetrics-codewind': '^0.1.0',
            };
            const project = createNodeProjectWithPackageJsonDependencies({}, projectDir, packageJsonDependencies);
            projectList.addProject(project);

            const request = {
                protocol: 'http',
                headers: { host: '127.0.0.1:10000' },
                sanitizeParams: () => project.projectID,
                cw_user: { projectList },
            };
            const req = mockReq(request);
            const res = mockRes();

            await projectsController.getProject(req, res);

            res.status.should.be.calledOnceWith(200);
            res.send.args[0][0].should.deep.include(project);
            res.send.args[0][0].appMonitorUrl.should.be.a('string');
        });
    });
    describe('getProjects(req, res)', () => {
        it('returns 500 if our server errors while getting the project list', async() => {
            const request = {
                protocol: 'http',
                headers: { host: '127.0.0.1:10000' },
                sanitizeParams: () => 'goodProjectID',
                cw_user: {},
            };
            const req = mockReq(request);
            const res = mockRes();

            await projectsController.getProjects(req, res);

            res.status.should.be.calledOnceWith(500);
            res.send.args[0][0].should.be.an('error');
        });
        it('returns 200 and a list of projects if there are no errors', async() => {
            const projectList = new ProjectList();
            const project = createNodeProjectWithPackageJsonDependencies({}, projectDir, {});
            projectList.addProject(project);

            const request = {
                protocol: 'http',
                headers: { host: '127.0.0.1:10000' },
                sanitizeParams: () => project.projectID,
                cw_user: { projectList },
            };
            const req = mockReq(request);
            const res = mockRes();

            await projectsController.getProjects(req, res);

            res.status.should.be.calledOnceWith(200);
            res.send.args[0][0][0].should.deep.include(project);
            res.send.args[0][0][0].appMonitorUrl.should.be.a('string');
        });
    });
});
