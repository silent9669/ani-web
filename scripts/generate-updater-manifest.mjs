import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tag = process.argv[2];
const outputDir = process.argv[3] ?? 'release-artifacts';

if (!tag || !tag.startsWith('v')) {
  console.error('Usage: node scripts/generate-updater-manifest.mjs v1.0.1 [release-artifacts]');
  process.exit(1);
}

const version = tag.slice(1);
const releaseBase = `https://github.com/silent9669/ani-desk/releases/download/${tag}`;
const manifestPath = join(outputDir, 'latest.json');

const platforms = {
  'darwin-aarch64': platformEntry(`ani-desk_${version}_aarch64.app.tar.gz`),
  'windows-x86_64': platformEntry(`ani-desk_${version}_x64-setup.exe`),
  'linux-x86_64': platformEntry(`ani-desk_${version}_amd64.AppImage`),
};

const manifest = {
  version,
  notes: `ani-desk ${version} update`,
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(`${manifestPath}.sha256`, `${sha256(manifestPath)}  latest.json\n`);
console.log(`Generated ${manifestPath}`);

function platformEntry(assetName) {
  const signaturePath = join(outputDir, `${assetName}.sig`);
  if (!existsSync(signaturePath)) {
    console.error(`Missing updater signature: ${signaturePath}`);
    process.exit(1);
  }

  return {
    signature: readFileSync(signaturePath, 'utf8').trim(),
    url: `${releaseBase}/${assetName}`,
  };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
