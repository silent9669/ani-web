import { readFileSync } from 'node:fs';

const releaseTag = process.argv[2] ?? process.env.RELEASE_TAG ?? '';
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const tauriConfig = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));

function cargoVersion(path) {
  const toml = readFileSync(path, 'utf8');
  const match = toml.match(/^\s*version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Could not find package version in ${path}`);
  }
  return match[1];
}

const versions = new Map([
  ['package.json', packageJson.version],
  ['src-tauri/tauri.conf.json', tauriConfig.version],
  ['Cargo.toml', cargoVersion('Cargo.toml')],
  ['src-tauri/Cargo.toml', cargoVersion('src-tauri/Cargo.toml')]
]);

const uniqueVersions = new Set(versions.values());
if (uniqueVersions.size !== 1) {
  console.error('Release version mismatch:');
  for (const [path, version] of versions) {
    console.error(`- ${path}: ${version}`);
  }
  process.exit(1);
}

const [version] = uniqueVersions;
const expectedTag = `v${version}`;
if (releaseTag && releaseTag !== expectedTag) {
  console.error(`Release tag ${releaseTag} does not match project version ${expectedTag}.`);
  process.exit(1);
}

if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${expectedTag}\n`);
}

console.log(`Release version verified: ${expectedTag}`);
