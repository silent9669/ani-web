import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const inputPath = 'logo.png';
const iconSourcePath = 'src-tauri/icons/icon-source.png';
const publicLogoPath = 'web/public/logo.png';
const iconSize = 1024;
const iconArtworkFill = 0.76;
const faviconArtworkFill = 0.9;
const crcTable = makeCrcTable();

const source = readPng(readFileSync(inputPath));
const icon = makeAppIcon(source);
const favicon = makeFavicon(source);

mkdirSync(dirname(iconSourcePath), { recursive: true });
mkdirSync(dirname(publicLogoPath), { recursive: true });
writeFileSync(iconSourcePath, writePng(iconSize, iconSize, icon));
copyFileSync(inputPath, publicLogoPath);
writeWebIcons(icon, favicon);

console.log(`Prepared ${iconSourcePath} from ${inputPath} (${source.width}x${source.height} -> ${iconSize}x${iconSize}, artwork fill ${Math.round(iconArtworkFill * 100)}%).`);
console.log(`Refreshed ${publicLogoPath} from ${inputPath}.`);
console.log('Refreshed browser favicon, Apple touch icon, and installable web icons.');

function writeWebIcons(appIconRgba, faviconRgba) {
  const sizes = [16, 32, 180, 192, 512];
  const pngs = new Map(
    sizes.map((size) => {
      const sourceRgba = size <= 32 ? faviconRgba : appIconRgba;
      const rgba = resizeSquare(sourceRgba, iconSize, size);
      return [size, writePng(size, size, rgba)];
    }),
  );

  writeFileSync('web/public/favicon-16x16.png', pngs.get(16));
  writeFileSync('web/public/favicon-32x32.png', pngs.get(32));
  writeFileSync('web/public/apple-touch-icon.png', pngs.get(180));
  writeFileSync('web/public/web-app-192.png', pngs.get(192));
  writeFileSync('web/public/web-app-512.png', pngs.get(512));
  writeFileSync('web/public/favicon.ico', writeIco([pngs.get(16), pngs.get(32)], [16, 32]));
}

function makeFavicon(sourceImage) {
  const background = sampleBackground(sourceImage);
  const foreground = findForegroundBounds(sourceImage, background) ?? findAlphaBounds(sourceImage);
  if (!foreground) {
    throw new Error(`${inputPath} does not contain visible artwork.`);
  }

  // Favicons are displayed against browser-controlled tab colours. Keep the
  // ani-desk mark on its original black field so it stays recognisable in both
  // light and dark browser chrome instead of becoming a floating red outline.
  const target = Buffer.alloc(iconSize * iconSize * 4);
  for (let index = 0; index < target.length; index += 4) {
    target[index] = background.r;
    target[index + 1] = background.g;
    target[index + 2] = background.b;
    target[index + 3] = 255;
  }
  const maxArtwork = Math.floor(iconSize * faviconArtworkFill);
  const scale = Math.min(maxArtwork / foreground.width, maxArtwork / foreground.height);
  const drawWidth = Math.max(1, Math.round(foreground.width * scale));
  const drawHeight = Math.max(1, Math.round(foreground.height * scale));
  const left = Math.floor((iconSize - drawWidth) / 2);
  const top = Math.floor((iconSize - drawHeight) / 2);

  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      const srcX = foreground.left + Math.min(foreground.width - 1, Math.floor(x / scale));
      const srcY = foreground.top + Math.min(foreground.height - 1, Math.floor(y / scale));
      const sourceIndex = (srcY * sourceImage.width + srcX) * 4;
      const distance =
        Math.abs(sourceImage.rgba[sourceIndex] - background.r) +
        Math.abs(sourceImage.rgba[sourceIndex + 1] - background.g) +
        Math.abs(sourceImage.rgba[sourceIndex + 2] - background.b);
      const backgroundAlpha = Math.max(0, Math.min(1, (distance - 24) / 44));
      const alpha = Math.round(sourceImage.rgba[sourceIndex + 3] * backgroundAlpha);
      const targetIndex = ((top + y) * iconSize + left + x) * 4;
      const foregroundAlpha = alpha / 255;
      target[targetIndex] = Math.round(
        sourceImage.rgba[sourceIndex] * foregroundAlpha + target[targetIndex] * (1 - foregroundAlpha),
      );
      target[targetIndex + 1] = Math.round(
        sourceImage.rgba[sourceIndex + 1] * foregroundAlpha + target[targetIndex + 1] * (1 - foregroundAlpha),
      );
      target[targetIndex + 2] = Math.round(
        sourceImage.rgba[sourceIndex + 2] * foregroundAlpha + target[targetIndex + 2] * (1 - foregroundAlpha),
      );
      target[targetIndex + 3] = 255;
    }
  }

  return target;
}

function resizeSquare(source, sourceSize, targetSize) {
  const output = Buffer.alloc(targetSize * targetSize * 4);
  const scale = sourceSize / targetSize;
  for (let y = 0; y < targetSize; y += 1) {
    const sourceTop = y * scale;
    const sourceBottom = Math.min(sourceSize, (y + 1) * scale);
    for (let x = 0; x < targetSize; x += 1) {
      const sourceLeft = x * scale;
      const sourceRight = Math.min(sourceSize, (x + 1) * scale);
      const totals = [0, 0, 0, 0];
      let totalWeight = 0;

      for (let sourceY = Math.floor(sourceTop); sourceY < Math.ceil(sourceBottom); sourceY += 1) {
        const verticalWeight = Math.min(sourceBottom, sourceY + 1) - Math.max(sourceTop, sourceY);
        for (let sourceX = Math.floor(sourceLeft); sourceX < Math.ceil(sourceRight); sourceX += 1) {
          const horizontalWeight = Math.min(sourceRight, sourceX + 1) - Math.max(sourceLeft, sourceX);
          const weight = horizontalWeight * verticalWeight;
          const sourceIndex = (sourceY * sourceSize + sourceX) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += source[sourceIndex + channel] * weight;
          }
          totalWeight += weight;
        }
      }

      const outputIndex = (y * targetSize + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        output[outputIndex + channel] = Math.round(totals[channel] / totalWeight);
      }
    }
  }
  return output;
}

function writeIco(images, sizes) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(images.length * 16);
  let offset = header.length + entries.length;
  images.forEach((image, index) => {
    const entry = index * 16;
    entries[entry] = sizes[index] === 256 ? 0 : sizes[index];
    entries[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    entries[entry + 2] = 0;
    entries[entry + 3] = 0;
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(image.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  return Buffer.concat([header, entries, ...images]);
}

function makeAppIcon(sourceImage) {
  const background = sampleBackground(sourceImage);
  const foreground = findForegroundBounds(sourceImage, background) ?? findAlphaBounds(sourceImage);
  if (!foreground) {
    throw new Error(`${inputPath} does not contain visible artwork.`);
  }

  const target = Buffer.alloc(iconSize * iconSize * 4);
  for (let index = 0; index < target.length; index += 4) {
    target[index] = background.r;
    target[index + 1] = background.g;
    target[index + 2] = background.b;
    target[index + 3] = 255;
  }

  const maxArtwork = Math.floor(iconSize * iconArtworkFill);
  const scale = Math.min(maxArtwork / foreground.width, maxArtwork / foreground.height);
  const drawWidth = Math.max(1, Math.round(foreground.width * scale));
  const drawHeight = Math.max(1, Math.round(foreground.height * scale));
  const left = Math.floor((iconSize - drawWidth) / 2);
  const top = Math.floor((iconSize - drawHeight) / 2);

  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      const srcX = foreground.left + Math.min(foreground.width - 1, Math.floor(x / scale));
      const srcY = foreground.top + Math.min(foreground.height - 1, Math.floor(y / scale));
      const sourceIndex = (srcY * sourceImage.width + srcX) * 4;
      const targetIndex = ((top + y) * iconSize + left + x) * 4;
      const alpha = sourceImage.rgba[sourceIndex + 3] / 255;
      target[targetIndex] = Math.round(sourceImage.rgba[sourceIndex] * alpha + target[targetIndex] * (1 - alpha));
      target[targetIndex + 1] = Math.round(sourceImage.rgba[sourceIndex + 1] * alpha + target[targetIndex + 1] * (1 - alpha));
      target[targetIndex + 2] = Math.round(sourceImage.rgba[sourceIndex + 2] * alpha + target[targetIndex + 2] * (1 - alpha));
      target[targetIndex + 3] = 255;
    }
  }

  return target;
}

function sampleBackground(sourceImage) {
  const index = 0;
  const alpha = sourceImage.rgba[index + 3];
  if (alpha < 16) return { r: 5, g: 6, b: 8 };
  return {
    r: sourceImage.rgba[index],
    g: sourceImage.rgba[index + 1],
    b: sourceImage.rgba[index + 2],
  };
}

function findForegroundBounds(sourceImage, background) {
  let left = sourceImage.width;
  let top = sourceImage.height;
  let right = -1;
  let bottom = -1;
  let count = 0;
  for (let y = 0; y < sourceImage.height; y += 1) {
    for (let x = 0; x < sourceImage.width; x += 1) {
      const index = (y * sourceImage.width + x) * 4;
      const alpha = sourceImage.rgba[index + 3];
      if (alpha < 16) continue;
      const distance =
        Math.abs(sourceImage.rgba[index] - background.r) +
        Math.abs(sourceImage.rgba[index + 1] - background.g) +
        Math.abs(sourceImage.rgba[index + 2] - background.b);
      if (distance <= 42) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      count += 1;
    }
  }
  if (count < 32) return null;
  return boundsFromEdges(left, top, right, bottom);
}

function findAlphaBounds(sourceImage) {
  let left = sourceImage.width;
  let top = sourceImage.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < sourceImage.height; y += 1) {
    for (let x = 0; x < sourceImage.width; x += 1) {
      const alpha = sourceImage.rgba[(y * sourceImage.width + x) * 4 + 3];
      if (alpha < 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return boundsFromEdges(left, top, right, bottom);
}

function boundsFromEdges(left, top, right, bottom) {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function readPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error(`${inputPath} is not a PNG file.`);
  }

  let offset = 8;
  let ihdr;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12]
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!ihdr) {
    throw new Error(`${inputPath} is missing IHDR metadata.`);
  }
  if (ihdr.bitDepth !== 8 || ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0) {
    throw new Error(`${inputPath} must be an 8-bit non-interlaced PNG.`);
  }
  if (![2, 6].includes(ihdr.colorType)) {
    throw new Error(`${inputPath} must be RGB or RGBA PNG; received color type ${ihdr.colorType}.`);
  }

  const channels = ihdr.colorType === 6 ? 4 : 3;
  const rowBytes = ihdr.width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = Buffer.alloc(ihdr.width * ihdr.height * channels);
  let readOffset = 0;
  let previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < ihdr.height; y += 1) {
    const filterType = inflated[readOffset];
    readOffset += 1;
    const filtered = inflated.subarray(readOffset, readOffset + rowBytes);
    readOffset += rowBytes;
    const unfiltered = unfilterRow(filtered, previous, filterType, channels);
    unfiltered.copy(raw, y * rowBytes);
    previous = unfiltered;
  }

  const rgba = Buffer.alloc(ihdr.width * ihdr.height * 4);
  for (let i = 0, j = 0; i < raw.length; i += channels, j += 4) {
    rgba[j] = raw[i];
    rgba[j + 1] = raw[i + 1];
    rgba[j + 2] = raw[i + 2];
    rgba[j + 3] = channels === 4 ? raw[i + 3] : 255;
  }

  return { width: ihdr.width, height: ihdr.height, rgba };
}

function unfilterRow(row, previous, filterType, bpp) {
  const output = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bpp ? output[i - bpp] : 0;
    const up = previous[i] ?? 0;
    const upLeft = i >= bpp ? previous[i - bpp] : 0;
    switch (filterType) {
      case 0:
        output[i] = row[i];
        break;
      case 1:
        output[i] = (row[i] + left) & 0xff;
        break;
      case 2:
        output[i] = (row[i] + up) & 0xff;
        break;
      case 3:
        output[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
        break;
      case 4:
        output[i] = (row[i] + paeth(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error(`Unsupported PNG filter type ${filterType}.`);
    }
  }
  return output;
}

function writePng(width, height, rgba) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    rgba.copy(rows, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  if (pb <= pc) {
    return up;
  }
  return upLeft;
}
