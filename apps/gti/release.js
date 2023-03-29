

/*
 * Creates a standalone version of GTI in a temp folder that can be zipped up
 * and deployed as a DotSlash artifact.
 */

const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const nodeMajorVersion = parseInt(process.versions.node.split('.', 1)[0], 10);
if (nodeMajorVersion < 16) {
  console.error('BUILD FAILED: build script requires at least Node 16');
  process.exit(1);
}

function getOutDir() {
  const numArgs = process.argv.length;
  switch (numArgs) {
    case 2:
      return fs.mkdtempSync(path.join(os.tmpdir(), 'gti'));
    case 3:
      return process.argv[2];
    default:
      throw new Error(`unexpected number of args to release.js: ${numArgs}`);
  }
}

const outDir = getOutDir();
console.log(`output will be written to ${outDir}`);

// Build the server component.
const serverDir = path.resolve(path.join(__dirname, '..', 'gti-server'));
const serverDistDir = path.join(serverDir, 'dist');
rm_rf(serverDistDir);
execSync('yarn run build', serverDir);

copyPathToOutput('gti-server/dist');
// although run-proxy is bundled with webpack, some dependencies (ws)
// don't play well with webpack and need to be included anyway
// Note: such dependencies should be set as externals in the webpack config.
copyPathToOutput('gti-server/node_modules/ws');

// Build the client.
const clientBuildDir = './build';
rm_rf(clientBuildDir);
execSync('yarn run build');

copyPathToOutput(path.join('gti', clientBuildDir));
const gtiScript = path.join(outDir, 'run-gti');
const gitBat = path.join(outDir, 'run-gti.bat');
fs.copyFileSync('./release/run-gti.template.sh', gtiScript);
fs.copyFileSync('./release/run-gti.template.bat', gitBat);
fs.chmodSync(gtiScript, 0o755);
fs.chmodSync(gtiBat, 0o755);

console.info(`You can run GTI at: ${process.platform === 'win32' ? gitBat : gtiScript}`);

function copyPathToOutput(fileOrFolder) {
  // paths are relative to workspace root, not gti
  const source = path.join('..', fileOrFolder);
  const destPath = path.join(outDir, fileOrFolder);
  console.log(`copy ${source} -> ${destPath}`);
  const isFile = fs.statSync(source).isFile();
  fs.mkdirSync(path.dirname(destPath), {recursive: true});
  if (isFile) {
    fs.copyFileSync(source, destPath);
  } else {
    fs.cpSync(source, destPath, {recursive: true});
  }
  return destPath;
}

function execSync(command, cwd = null) {
  const opts = {stdio: 'inherit'};
  if (cwd != null) {
    opts.cwd = cwd;
  }

  console.log(`${cwd != null ? cwd : ''}$ ${command}`);
  return child_process.execSync(command, opts);
}

function rm_rf(path) {
  fs.rmSync(path, {force: true, recursive: true});
}
