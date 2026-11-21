import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDirectory = path.resolve(frontendDirectory, '..', 'backend');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const forwardedArguments = process.argv.slice(2);

const startNpmProcess = (args, cwd) => {
  const command = process.platform === 'win32'
    ? (process.env.ComSpec || 'cmd.exe')
    : npmCommand;
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', npmCommand, ...args]
    : args;

  return spawn(command, commandArgs, { cwd, stdio: 'inherit' });
};

const backendProcess = startNpmProcess(['start'], backendDirectory);

const frontendProcess = startNpmProcess(
  ['run', 'dev:frontend', '--', ...forwardedArguments],
  frontendDirectory
);

let isStopping = false;

const stopChildren = () => {
  if (isStopping) return;
  isStopping = true;
  frontendProcess.kill('SIGTERM');
  backendProcess.kill('SIGTERM');
};

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);

backendProcess.on('error', (error) => {
  console.error('Unable to start the Chatterly backend:', error.message);
});

backendProcess.on('exit', (code) => {
  if (!isStopping && code && code !== 0) {
    console.warn('The backend stopped before the frontend. Email OTP and chat APIs will be unavailable.');
  }
});

frontendProcess.on('error', (error) => {
  console.error('Unable to start the Chatterly frontend:', error.message);
  stopChildren();
  process.exitCode = 1;
});

frontendProcess.on('exit', (code) => {
  stopChildren();
  process.exitCode = code ?? 0;
});
