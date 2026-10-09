const fs = require('fs');
const path = require('path');

const srcPng = path.join(__dirname, '../nuraxq-icon.png');
const outIco = path.join(__dirname, '../favicon.ico');
const outPng = path.join(__dirname, '../favicon.png');

if (fs.existsSync(srcPng)) {
  const pngBuf = fs.readFileSync(srcPng);
  
  // Also create favicon.png
  fs.writeFileSync(outPng, pngBuf);
  console.log('Created favicon.png (' + pngBuf.length + ' bytes)');

  // Build ICO container for PNG
  // Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image

  // Entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // width (0 = 256 or auto)
  entry.writeUInt8(0, 1); // height
  entry.writeUInt8(0, 2); // color palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8); // image size
  entry.writeUInt32LE(22, 12); // image offset (6 + 16 = 22)

  const icoBuf = Buffer.concat([header, entry, pngBuf]);
  fs.writeFileSync(outIco, icoBuf);
  console.log('Created favicon.ico (' + icoBuf.length + ' bytes)');
} else {
  console.error('Source nuraxq-icon.png not found');
}
