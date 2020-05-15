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
const uuidv4 = require('uuid/v4');
const { promisify } = require('util');
const git = require('simple-git/promise');
const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const klawSync = require('klaw-sync');
const globToRegExp = require('glob-to-regexp');
const replace = require('replace-in-file');

const { projectTypeToIgnoredPaths } = require('../../src/pfe/portal/modules/utils/ignoredPaths');
const { ADMIN_COOKIE, templateOptions } = require('../config');
const reqService = require('./request.service');
const SocketService = require('./socket.service');

chai.should();
const sleep = promisify(setTimeout);

// These are for the default Codewind templates at https://github.com/codewind-resources
// TODO: can we replace this with `const relativeFilepathsToUpload = getRelativeFilepathsToUpload(pathToDirToUpload, projectType);`? (see below)
const defaultSyncLists = {
    nodejs: {
        fileList: [
            '.cw-settings',
            '.dockerignore',
            '.gitignore',
            '.npmrc',
            'Dockerfile',
            'Dockerfile-tools',
            'README.md',
            'chart/node/Chart.yaml',
            'chart/node/templates/basedeployment.yaml',
            'chart/node/templates/deployment.yaml',
            'chart/node/templates/hpa.yaml',
            'chart/node/templates/istio.yaml',
            'chart/node/templates/service.yaml',
            'chart/node/values.yaml',
            'images/header-logo.svg',
            'nodemon.json',
            'package.json',
            'public/404.html',
            'public/500.html',
            'public/index.html',
            'server/config/local.json',
            'server/routers/codewind.js',
            'server/routers/health.js',
            'server/routers/index.js',
            'server/routers/public.js',
            'server/server.js',
            'test/test-demo.js',
            'test/test-server.js',
        ],
        directoryList: [
            'chart',
            'chart/node',
            'chart/node/templates',
            'public',
            'server',
            'server/config',
            'server/routers',
            'test',
            'images',
        ],
    },
    spring: {
        fileList: [
            'Dockerfile',
            'Dockerfile-build',
            'Dockerfile-tools',
            'README.md',
            'chart/springjavatemplate/Chart.yaml',
            'chart/springjavatemplate/bindings.yaml',
            'chart/springjavatemplate/templates/basedeployment.yaml',
            'chart/springjavatemplate/templates/deployment.yaml',
            'chart/springjavatemplate/templates/hpa.yaml',
            'chart/springjavatemplate/templates/istio.yaml',
            'chart/springjavatemplate/templates/service.yaml',
            'chart/springjavatemplate/values.yaml',
            'pom.xml',
            'src/main/java/application/Info.java',
            'src/main/java/application/SBApplication.java',
            'src/main/java/application/rest/HealthEndpoint.java',
            'src/main/java/application/rest/v1/Example.java',
            'src/main/resources/application-local.properties',
            'src/main/resources/application.properties',
            'src/main/resources/public/index.html',
            'src/test/java/application/HealthEndpointTest.java',
        ],
        directoryList: [
            'chart',
            'chart/springjavatemplate',
            'chart/springjavatemplate/templates',
            'src',
            'src/main',
            'src/main/java',
            'src/main/java/application',
            'src/main/java/application/rest',
            'src/main/java/application/rest/v1',
            'src/main/resources',
            'src/main/resources/public',
            'src/test',
            'src/test/java',
            'src/test/java/application',
        ],
    },
    liberty: {
        fileList: [
            'Dockerfile',
            'Dockerfile-build',
            'Dockerfile-tools',
            'README.md',
            'chart/javamicroprofiletemplate/Chart.yaml',
            'chart/javamicroprofiletemplate/bindings.yaml',
            'chart/javamicroprofiletemplate/templates/basedeployment.yaml',
            'chart/javamicroprofiletemplate/templates/deployment.yaml',
            'chart/javamicroprofiletemplate/templates/hpa.yaml',
            'chart/javamicroprofiletemplate/templates/istio.yaml',
            'chart/javamicroprofiletemplate/templates/service.yaml',
            'chart/javamicroprofiletemplate/values.yaml',
            'pom.xml',
            'src/main/java/application/HealthEndpoint.java',
            'src/main/java/application/rest/JaxrsApplication.java',
            'src/main/java/application/rest/RootEndpoint.java',
            'src/main/java/application/rest/v1/Example.java',
            'src/main/liberty/config/jvm.options',
            'src/main/liberty/config/jvmbx.options',
            'src/main/liberty/config/server.xml',
            'src/main/resources/index.html',
            'src/main/webapp/WEB-INF/beans.xml',
            'src/main/webapp/WEB-INF/ibm-web-ext.xml',
            'src/test/java/it/HealthEndpointIT.java' ],
        directoryList: [
            'chart',
            'chart/javamicroprofiletemplate',
            'chart/javamicroprofiletemplate/templates',
            'src',
            'src/main',
            'src/main/java',
            'src/main/java/application',
            'src/main/java/application/rest',
            'src/main/java/application/rest/v1',
            'src/main/liberty',
            'src/main/liberty/config',
            'src/main/resources',
            'src/main/webapp',
            'src/main/webapp/WEB-INF',
            'src/test',
            'src/test/java',
            'src/test/java/it',
        ],
    },
};

/**
 * Clone, bind and build one of our template projects
 */
async function createProjectFromTemplate(name, projectType, path, autoBuild = false) {
    const { url, language } = templateOptions[projectType];
    const pfeProjectType = (['openliberty', 'go', 'lagom'].includes(projectType))
        ? 'docker'
        : projectType;

    await cloneProjectAndReplacePlaceholders(url, path, name);

    const res = await bindProject({
        name,
        path,
        language,
        projectType: pfeProjectType,
        autoBuild,
        creationTime: Date.now(),
    });
    return res.body.projectID;
}

/**
 * @param {JSON} [options] e.g. { name: 'example' }
 * @param {number} [expectedResStatus] default 200
 */
async function bindProject(options) {
    const resFromBindStart = await bindStart(options);
    const { projectID } = resFromBindStart.body;
    const { path, projectType } = options;
    await uploadAllFiles(projectID, path, projectType);
    const resFromBindEnd = await bindEnd(projectID);
    return resFromBindEnd;
}

async function syncFiles(
    projectID,
    pathToLocalProject,
    pathsFromDirToModifiedFiles,
    fileList,
    directoryList,
) {
    const responsesToUploadFile = await uploadFiles(
        projectID,
        pathToLocalProject,
        pathsFromDirToModifiedFiles,
    );

    responsesToUploadFile.forEach(res => {
        res.should.have.status(200);
    });

    const options = {
        fileList,
        directoryList,
        modifiedList: pathsFromDirToModifiedFiles,
        timeStamp: Date.now(),
    };
    const resToUploadEnd = await uploadEnd(projectID, options);
    return resToUploadEnd;
}

function recursivelyGetAllPaths(inputPath) {
    const paths = klawSync(inputPath,  { nodir: true });
    const filePaths = paths.map((path) => path.path);
    return filePaths;
};

async function bindStart(options) {
    const res = await reqService.chai
        .post('/api/v1/projects/bind/start')
        .set('Cookie', ADMIN_COOKIE)
        .send(options);
    return res;
};

async function bindEnd(projectID) {
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/bind/end`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ id: projectID });
    return res;
};

async function uploadEnd(projectID, options) {
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/upload/end`)
        .set('Cookie', ADMIN_COOKIE)
        .send(options);
    return res;
};

function uploadAllFiles(projectID, pathToDirToUpload, projectType) {
    const relativeFilepathsToUpload = getRelativeFilepathsToUpload(pathToDirToUpload, projectType);
    return uploadFiles(projectID, pathToDirToUpload, relativeFilepathsToUpload);
}

async function uploadFiles(projectID, pathToDirToUpload, relativeFilepathsToUpload) {
    const promises = relativeFilepathsToUpload.map(
        pathFromDirToFile => uploadFile(projectID, pathToDirToUpload, pathFromDirToFile)
    );
    const responses = await Promise.all(promises);
    return responses;
}

function getRelativeFilepathsToUpload(pathToDirToUpload, projectType) {
    const filepaths = recursivelyGetAllPaths(pathToDirToUpload);
    const relativeFilepaths = filepaths.map(
        filePath => path.relative(pathToDirToUpload, filePath)
    );
    const relativeFilepathsToUpload = relativeFilepaths.filter(
        filepath => !isIgnoredFilepath(filepath, projectType)
    );
    return relativeFilepathsToUpload;
}

function isIgnoredFilepath(relativeFilepath, projectType) {
    const ignoredFilepaths = projectTypeToIgnoredPaths[projectType];
    const regExpIgnoredFilepaths = ignoredFilepaths.map(path => globToRegExp(path));
    const isIgnored = regExpIgnoredFilepaths.some(
        ignoredPath => ignoredPath.test(`/${relativeFilepath}`)
    );
    return isIgnored;
}

async function uploadFile(projectID, pathToDirToUpload, pathFromDirToFile) {
    const absoluteFilepath = path.join(pathToDirToUpload, pathFromDirToFile);
    const base64CompressedContent = zipFileToBase64(absoluteFilepath);
    const options = {
        isDirectory: false,
        mode: 420,
        path: pathFromDirToFile,
        msg: base64CompressedContent,
    };
    const res = await reqService.chai
        .put(`/api/v1/projects/${projectID}/upload`)
        .set('Cookie', ADMIN_COOKIE)
        .send(options);
    return res;
};

function zipFileToBase64(filepath) {
    const fileContent = fs.readFileSync(filepath, 'utf-8');
    const zippedContent = zlib.deflateSync(fileContent);
    const base64CompressedContent = zippedContent.toString('base64');
    return base64CompressedContent;
}

/**
 * @param {JSON} [options] e.g. { name: 'example' }
 * @param {number} [expectedResStatus] default 202
 */
async function unbind(projectID, expectedResStatus = 202) {
    const req = () => reqService.chai
        .post(`/api/v1/projects/${projectID}/unbind`)
        .set('Cookie', ADMIN_COOKIE);
    const res = await reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { projectID, msgType: 'projectDeletion' });
    return res;
}

/**
 * For cleaning up PFE
 */
async function unbindAllProjects() {
    const projectIds = await getProjectIDs();
    const promises = projectIds.map(id => unbind(id));
    await Promise.all(promises);
}

async function buildProject(projectID, action) {
    const res = await reqService.chai.post(`/api/v1/projects/${projectID}/build`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ action });
    return res;
}

function generateUniqueName(baseName = 'test') {
    const uniqueNumbers = uuidv4()
        .replace(/[^0-9]/gi, '')
        .substring(0,10);
    return `${baseName}${uniqueNumbers}`;
}

function createProjects(optionsArray) {
    if (!Array.isArray(optionsArray)) throw new Error(`'${optionsArray}' should be an array`);
    const promises = optionsArray.map(options =>
        createProjectFromTemplate(options.projectName, options.projectType)
    );
    return Promise.all(promises);
}

function openProject(projectID, expectedResStatus) {
    if (typeof projectID !== 'string') {
        throw new Error(`'${projectID}' should be a string`);
    }
    const req = () => reqService.chai
        .put(`/api/v1/projects/${projectID}/open`)
        .set('Cookie', ADMIN_COOKIE);
    const res = reqService.makeReq(req, expectedResStatus);
    return res;
}

/**
 * @param {String} projectID
 * @param {number} [expectedResStatus] e.g. 202
 * @param {boolean} [awaitSocketConfirmation] if true, will wait for projectClose event. If false will not wait for it
 */
function closeProject(
    projectID,
    expectedResStatus,
    awaitSocketConfirmation,
) {
    if (typeof projectID !== 'string') {
        throw new Error(`'${projectID}' should be a string`);
    }
    const req = () => reqService.chai
        .put(`/api/v1/projects/${projectID}/close`)
        .set('Cookie', ADMIN_COOKIE);
    const res = awaitSocketConfirmation
        ? reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { projectID, msgType: 'projectClosed' })
        : reqService.makeReq(req, expectedResStatus);
    return res;
}

async function removeProject(pathToProjectDir, projectID){
    fs.removeSync(pathToProjectDir);
    await unbind(projectID);
}

/**
 *
 * @param {String} projectID
 * @param {String} [startMode] "run", "debug", and "debugNoInit" are permitted startModes
 * @param {number} [expectedResStatus] e.g. 202
 * @param {boolean} [awaitSocketConfirmation] false by default, so won't wait for projectStart. Set to true to make it wait until the project is starting
 */
function restartProject(
    projectID,
    startMode,
    expectedResStatus,
    awaitSocketConfirmation,
) {
    if (typeof projectID !== 'string') {
        throw new Error(`'${projectID}' should be a string`);
    }
    const req = () => reqService.chai
        .post(`/api/v1/projects/${projectID}/restart`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ startMode });
    const res = awaitSocketConfirmation
        ? reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { projectID, msgType: 'projectStarting' })
        : reqService.makeReq(req, expectedResStatus);
    return res;
}

async function getProjects() {
    const req = () => reqService.chai
        .get('/api/v1/projects')
        .set('Cookie', ADMIN_COOKIE);
    const res = await reqService.makeReq(req, 200);
    if (!Array.isArray(res.body)) throw new Error(`'${res.body}' should be an array`);
    return res.body;
}

async function getWatchList() {
    const req = () => reqService.chai
        .get('/api/v1/projects/watchlist')
        .set('Cookie', ADMIN_COOKIE);
    const res = await reqService.makeReq(req, 200);
    return res;
}

async function getProject(id) {
    const req = () => reqService.chai
        .get(`/api/v1/projects/${id}`)
        .set('Cookie', ADMIN_COOKIE);
    const res = await reqService.makeReq(req);
    return res;
}

async function getProjectIDs() {
    const projects = await getProjects();
    const projectIDs = projects.map(project => project.projectID);
    return projectIDs;
}

async function countProjects() {
    const projects = await getProjects();
    return projects.length;
}

/**
 * Waits indefinitely for GET project to succeed
 */
async function awaitProject(id) {
    const project = await getProject(id);
    if (project) return true;

    await sleep(1000);
    return awaitProject(id);
}

async function awaitProjectStartedHTTP(id) {
    const { body: project } = await getProject(id);
    const { containerId, appStatus } = project;
    if (!containerId || appStatus !== 'started') {
        await sleep(1000); // wait one second
        await awaitProjectStartedHTTP(id);
    }
}

async function awaitProjectStarted(projectID) {
    const socketService = await SocketService.createSocket();
    const expectedSocketMsg = {
        projectID,
        msgType: 'projectStarted',
    };
    await socketService.checkForMsg(expectedSocketMsg);
    socketService.close();
}

async function awaitProjectBuilding(projectID) {
    const socketService = await SocketService.createSocket();
    const expectedSocketMsg = {
        projectID,
        msgType: 'projectBuilding',
    };
    await socketService.checkForMsg(expectedSocketMsg);
    socketService.close();
}

async function runLoad(projectID, description) {
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/loadtest`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ description });
    return res;
}

async function cancelLoad(projectID) {
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/loadtest/cancel`)
        .set('Cookie', ADMIN_COOKIE);
    return res;
}

async function getLogStreams(projectID) {
    const res = await reqService.chai
        .get(`/api/v1/projects/${projectID}/logs`)
        .set('Cookie', ADMIN_COOKIE);
    res.should.have.status(200);
    res.should.have.ownProperty('body');
    res.body.should.be.an('object');
    return res.body;
}

async function startLogStreams(projectID) {
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/logs`)
        .set('Cookie', ADMIN_COOKIE);
    res.should.have.status(200);
    res.should.have.ownProperty('body');
    res.body.should.be.an('object');
    return res.body;
}

async function cloneProject(giturl, dest) {
    await git().clone(giturl, dest);
}

async function cloneProjectAndReplacePlaceholders(giturl, dest, projectName) {
    await cloneProject(giturl, dest);
    const options = {
        files: `${dest}/*`,
        from: /\[PROJ_NAME_PLACEHOLDER\]/g,
        to: projectName,
    };
    await replace(options);
}

async function notifyPfeOfFileChangesAndAwaitMsg(array, projectID) {
    const deflateAsync = promisify(zlib.deflate);
    const str = JSON.stringify(array);
    const strBuffer = await deflateAsync(str);
    const base64Compressed = strBuffer.toString('base64');

    const req = () => reqService.chai
        .post(`/api/v1/projects/${projectID}/file-changes?timestamp=${Date.now()}&chunk=1&chunk_total=1`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ msg: base64Compressed });
    const expectedSocketMsg = {
        projectID,
        msgType: 'projectChanged',
    };
    await reqService.makeReqAndAwaitSocketMsg(req, 200, expectedSocketMsg);
}

async function getProjectLinks(projectID) {
    const res = await reqService.chai
        .get(`/api/v1/projects/${projectID}/links`)
        .set('Cookie', ADMIN_COOKIE);
    res.should.have.status(200);
    res.should.have.ownProperty('body');
    res.body.should.be.an('array');
    return res.body;
}

async function addProjectLink(projectID, targetProjectID, envName) {
    const reqBody = {
        targetProjectID,
        envName,
    };
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/links`)
        .set('Cookie', ADMIN_COOKIE)
        .send(reqBody);
    return res;
}

async function updateProjectLink(projectID, envName, updatedEnvName) {
    const reqBody = {
        envName,
        updatedEnvName,
    };
    const res = await reqService.chai
        .put(`/api/v1/projects/${projectID}/links`)
        .set('Cookie', ADMIN_COOKIE)
        .send(reqBody);
    return res;
}

async function deleteProjectLink(projectID, envName) {
    const res = await reqService.chai
        .delete(`/api/v1/projects/${projectID}/links`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ envName });
    return res;
}


module.exports = {
    generateUniqueName,
    createProjects,
    createProjectFromTemplate,
    syncFiles,
    defaultSyncLists,
    openProject,
    closeProject,
    restartProject,
    getProjects,
    getWatchList,
    getProject,
    getProjectIDs,
    countProjects,
    awaitProject,
    awaitProjectStartedHTTP,
    awaitProjectStarted,
    awaitProjectBuilding,
    runLoad,
    cancelLoad,
    getLogStreams,
    startLogStreams,
    bindProject,
    bindStart,
    bindEnd,
    uploadEnd,
    uploadAllFiles,
    uploadFile,
    unbind,
    unbindAllProjects,
    removeProject,
    buildProject,
    cloneProject,
    cloneProjectAndReplacePlaceholders,
    notifyPfeOfFileChangesAndAwaitMsg,
    getProjectLinks,
    addProjectLink,
    updateProjectLink,
    deleteProjectLink,
};
