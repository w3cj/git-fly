'use strict';

const inquirer = require('inquirer');
const safename = require('safename');

const process = require('process');
const spawn = require('child_process').spawn;

const GitCommandLine = require('git-command-line');
const Git = new GitCommandLine();

const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');

process.on('SIGINT', function() {
  if(running){
    running = false;
    if(cleanup) {
      cleanup();
    }
    askAgain();
  } else {
    console.log('Exiting process');
    process.exit();
  }
});

let questions = [{
  type: 'input',
  name: 'repo',
  message: 'What repo would you like to clone?'
}, {
  type: 'input',
  name: 'run',
  message: 'How do you want to run it?'
}];

let running = false;
let cleanup;

function ask() {
  inquirer.prompt(questions).then(function(answers) {
    let safePath = '/tmp/' + safename(answers.repo);
    console.log('Cloning repo into ' + safePath);
    running = false;
    cleanup = null;
    Git.clone(answers.repo + ' ' + safePath).then(function(res) {
      running = true;

      cleanup = function() {
        console.log('Cleaning up...');
        spawn('rm', ['-rf', safePath]);
      }

      let runWithParams = answers.run.split(' ');
      let command = runWithParams[0];
      let params = runWithParams.slice(1, runWithParams.length - 1)

      const run = spawn(command, params, {cwd: safePath});

      run.stdout.on('data', (data) => {
        if(running) {
          console.log(decoder.write(data));
        }
      });

      run.stderr.on('data', (data) => {
        if(running) {
          console.error(decoder.write(data));
        }
      });

    }).catch(function(err) {
      console.error('Failed to clone the repo with the following error:', err.stderr || err);
      askAgain();
    });
  });
}

function askAgain() {
  inquirer.prompt([{
    type: 'confirm',
    name: 'askAgain',
    message: 'Want to clone another repo?',
    default: true
  }]).then(function(answers) {
    if (answers.askAgain) {
      ask();
    } else {
      if(cleanup) {
        cleanup();
      }
      console.log('See you later!');
      process.exit();
    }
  })
}

ask();
