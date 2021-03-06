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
const fs = require('fs-extra');
const path = require('path');
const NODEMON_JSON_LOCATION = './scripts/nodemon.json';
const Logger = require('../utils/Logger');
const log = new Logger('acclimatise.js');

/**
 * Function to add "acclimatise" a project by:
 *    - Adding the nodemon.json if its a Node project
 *    - Initialising the directory as a Git repo
 * @param directory, the directory we want to use
 * @param projectName
 * @param projectType, used to check if we need a add a nodemon.json
 */
module.exports.acclimatiseAll = async function acclimatiseAll(directory, projectName, projectType) {
  let packageJsonFile = path.join(directory, 'package.json');
  let packageJsonFound = await fs.pathExists(packageJsonFile);
  if ((projectType && projectType == 'nodejs') || packageJsonFound) {
    // Either we've been told this is a nodejs project or we've located a package.json file
    await module.exports.copyNodemonFile(directory);
  }
}

/**
 * Function to copy the nodemon.json to a directory
 * @param directory, the directory to copy the nodemon.json to
 */
module.exports.copyNodemonFile = async function copyNodemonFile(directory) {
  let nodemonFile = path.join(directory, 'nodemon.json');
  await fs.copy(NODEMON_JSON_LOCATION, nodemonFile, { overwrite: false });
}

/**
 * Function to initialise the project as a Git repository
 * @param directory, the directory to to initialise
 * @param projectName, the name of the project, used in the commit message
 */
module.exports.initialiseGitRepository = async function initialiseGitRepository(directory, projectName) {
  log.debug(`initialiseGitRepository directory: ${directory} project:${projectName}`);
  let git = require('simple-git/promise')(directory);
  let configDirectory = path.join(directory, '../.config/git.config');
  // Check if the directory is already a Git repo
  let isGitRepo = await git.checkIsRepo();
  if (!isGitRepo) {
    await git.init();
  }
  let userName = await git.raw(['config', '-f', configDirectory, '--get', 'user.name']) || 'Codewind User';
  let userEmail = await git.raw(['config', '-f', configDirectory, '--get', 'user.email']) || 'codewind.user@localhost';
  await git.addConfig('user.name', userName);
  await git.addConfig('user.email', userEmail);
  if (process.env.EXTRA_GIT_OPTION) {
    let argArray = process.env.EXTRA_GIT_OPTION.split(' ');
    await git.raw(['config'].concat(argArray), (err, result) => {
      if (err) {
        log.error("Unable to process: git config " + process.env.EXTRA_GIT_OPTION);
        log.error(result);
      }
    }).catch(function(error) {
      log.error("Unable to process: git config" + process.env.EXTRA_GIT_OPTION);
      log.error(error);
    });
  }
  await git.add('.');
  await git.commit(`Microclimatizing ${projectName}`);
}
