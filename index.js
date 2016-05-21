#! /usr/bin/env node

'use strict';

const inquirer = require('inquirer');
const safename = require('safename');

const fs = require('fs');
const process = require('process');
const spawn = require('child_process').spawn;

const stdin = process.openStdin();
process.stdin.setRawMode(true);
stdin.resume();

const GitCommandLine = require('git-command-line');
const Git = new GitCommandLine();

const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');

let running = false;
let cleanupPaths = [];
let currentCleanup = 0;
let questions = [{
  type: 'input',
  name: 'repo',
  default: process.argv[2],
  message: 'repo URL (required):',
  validate: function(input) {
    return input ? true : 'You must enter a repo URL';
  }
}, {
  type: 'input',
  name: 'run',
  message: 'run command:'
}, {
  type: 'input',
  name: 'open',
  message: 'open command:'
}];

function start() {
  console.log('Welcome to git-fly');
  console.log('Temporarily clone/run/open git repos on the fly');
  currentCleanup = 0;

  inquirer.prompt(questions).then(function(answers) {
    let safePath = '/tmp/' + safename(answers.repo);
    running = false;

    function localRunIt() {
      if (answers.run) {
        running = true;
        runIt(answers.run, safePath);
      } else {
        startAgain();
      }
    }

    function checkPackageJSON() {
      fs.access(safePath + '/package.json', fs.F_OK, function(err) {
        if (!err) {
          inquirer.prompt([{
            type: 'confirm',
            name: 'install',
            message: 'package.json detected! run npm install?',
            default: false
          }]).then(function(answers) {
            if (answers.install) {
              const install = spawn('npm', ['install'], {
                cwd: safePath
              });
              console.log('Running npm install...')
              setupLog(install, 'Finished installing!', function() {
                localRunIt();
              });

            } else {
              localRunIt();
            }
          })
        } else {
          localRunIt();
        }
      })
    }

    function cloneRepo() {
      console.log('Cloning repo into ' + safePath);
      Git.clone(answers.repo + ' ' + safePath).then(function(res) {
        if (answers.open) {
          spawn(answers.open, [safePath]);
        }

        if(cleanupPaths.indexOf(safePath) == -1) {
          cleanupPaths.push(safePath);
        }

        checkPackageJSON();

      }).catch(function(err) {
        if (err.stderr.indexOf("already exists") > -1) {
          inquirer.prompt([{
            type: 'confirm',
            name: 'remove',
            message: safePath + ' already exists. Remove it and clone again?',
            default: false
          }]).then(function(answers) {
            if (answers.remove) {
              console.log('Removing ' + safePath + '...');
              cleanupPath(safePath, function () {
                cloneRepo();
              });
            } else {
              checkPackageJSON();
            }
          });
        } else {
          console.error('Error cloning repo:', err.stderr || err);
          startAgain();
        }
      });
    }

    cloneRepo();
  });
}

function cleanupPath(path, cb) {
  let rm = spawn('rm', ['-rf', path]);
  setupLog(rm, '', cb);
}

function cleanup(done) {
  if (cleanupPaths.length > 0 && currentCleanup == 0) {
    console.log('Starting cleanup...');
  } else {
    console.log('So long and thanks for all the fish.');
    return process.exit();
  }

  if(currentCleanup < cleanupPaths.length) {
    var path = cleanupPaths[currentCleanup];
    inquirer.prompt([{
      type: 'confirm',
      name: 'cleanup',
      message: 'Remove ' + path + '?',
      default: true
    }]).then(function(answers) {
      if(answers.cleanup) {
        cleanupPath(path, function(){
          console.log('Removed ' + path);
          currentCleanup++;
          cleanup();
        })
      }
    });
  } else if (cleanupPaths.length > 0) {
    console.log('Finished cleaning up!');
    console.log('So long and thanks for all the fish.');
    process.exit();
  }
}

function runIt(runCommand, path) {
  if (runCommand) {
    console.log('Running...');

    let params = runCommand.split(' ');
    let command = params[0];
    params.shift();

    const run = spawn(command, params, {
      cwd: path
    });

    setupLog(run, '', function() {
      console.log('Finished running.');
      startAgain();
    });
  }
}

function setupLog(child, finishMessage, next) {
  child.stdout.on('data', (data) => {
    if (running) {
      console.log(decoder.write(data));
    }
  });

  child.stderr.on('data', (data) => {
    if (running) {
      console.error(decoder.write(data));
    }
  });

  if (finishMessage || next) {
    child.on('close', (code) => {
      if (finishMessage) console.log(finishMessage);
      if (next) next();
    });
  }

}

function startAgain() {
  inquirer.prompt([{
    type: 'confirm',
    name: 'startAgain',
    message: 'Clone another repo?',
    default: true
  }]).then(function(answers) {
    if (answers.startAgain) {
      start();
    } else {
      cleanup();
    }
  })
}

process.on('SIGINT', function() {
  if (running) {
    running = false;
  } else {
    process.exit();
  }
});

start();
