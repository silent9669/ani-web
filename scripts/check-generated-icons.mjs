import { existsSync, statSync } from 'node:fs';

const required = [
  'logo.png',
  'src-tauri/icons/icon-source.png',
  'src-tauri/icons/icon.png',
  'src-tauri/icons/icon.icns',
  'src-tauri/icons/icon.ico',
  'src-tauri/icons/32x32.png',
  'src-tauri/icons/128x128.png',
  'src-tauri/icons/128x128@2x.png',
  'src-tauri/icons/Square44x44Logo.png',
  'src-tauri/icons/Square150x150Logo.png',
  'src-tauri/icons/StoreLogo.png',
  'web/public/logo.png',
  'web/public/favicon.ico',
  'web/public/favicon-16x16.png',
  'web/public/favicon-32x32.png',
  'web/public/apple-touch-icon.png',
  'web/public/web-app-192.png',
  'web/public/web-app-512.png'
];

const missing = required.filter((path) => {
  if (!existsSync(path)) {
    return true;
  }
  return statSync(path).size <= 0;
});

if (missing.length > 0) {
  console.error('Missing generated icon assets:');
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  console.error('Run: npm run icons');
  process.exit(1);
}

console.log(`Verified ${required.length} generated app icon assets.`);
