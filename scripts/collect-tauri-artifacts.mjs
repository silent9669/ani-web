import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const platform = process.argv[2];
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const outputDir = 'release-artifacts';

const artifactMap = {
  'macos-aarch64': [
    { bundleDir: 'dmg', ext: '.dmg', name: `ani-desk_${version}_aarch64.dmg` }
  ],
  'macos-x64': [
    { bundleDir: 'dmg', ext: '.dmg', name: `ani-desk_${version}_x64.dmg` }
  ],
  'windows-x64': [
    { bundleDir: 'nsis', ext: '.exe', name: `ani-desk_${version}_x64-setup.exe` },
    { bundleDir: 'msi', ext: '.msi', name: `ani-desk_${version}_x64.msi` }
  ],
  'linux-x64': [
    { bundleDir: 'appimage', ext: '.AppImage', name: `ani-desk_${version}_amd64.AppImage` },
    { bundleDir: 'deb', ext: '.deb', name: `ani-desk_${version}_amd64.deb` },
    { bundleDir: 'rpm', ext: '.rpm', name: `ani-desk_${version}_x86_64.rpm` }
  ]
};

if (!artifactMap[platform]) {
  console.error(`Unknown artifact platform: ${platform}`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

for (const expected of artifactMap[platform]) {
  const source = findNewestBundle(expected);
  const destination = join(outputDir, expected.name);
  copyFileSync(source, destination);
  writeFileSync(`${destination}.sha256`, `${sha256(destination)}  ${expected.name}\n`);
  console.log(`Collected ${basename(source)} -> ${expected.name}`);
}

function findNewestBundle({ bundleDir, ext }) {
  const matches = [];
  for (const root of ['target', 'src-tauri/target']) {
    walk(root, (path) => {
      const normalized = path.replaceAll('\\', '/');
      if (!normalized.includes(`/bundle/${bundleDir}/`)) {
        return;
      }
      if (normalized.endsWith(ext)) {
        matches.push(path);
      }
    });
  }

  if (matches.length === 0) {
    console.error(`Could not find ${ext} artifact under target/**/bundle/${bundleDir}/`);
    process.exit(1);
  }

  return matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function walk(root, visit) {
  if (!existsSync(root)) {
    return;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visit);
    } else if (entry.isFile()) {
      visit(fullPath);
    }
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
