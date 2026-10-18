// Exports the sprite sheet drawn by a "Pixel <Name>.html" generator to PNG,
// without a browser: the drawing code between "// <draw>" and "// </draw>"
// runs against a tiny canvas stand-in that only needs fillRect.
//
//   node _export_sprites.js "GUARD/Pixel Guard.html" GUARD/guard_spritesheet.png
'use strict';
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');

function makeCanvas(width, height) {
  const data = Buffer.alloc(width * height * 4);
  const ctx = {
    fillStyle: '#000',
    fillRect(x, y, w, h) {
      const hex = String(ctx.fillStyle).replace('#', '');
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
        for (let pxl = Math.max(0, x); pxl < Math.min(width, x + w); pxl++) {
          const o = (py * width + pxl) * 4;
          data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
        }
      }
    },
  };
  return { ctx, data, width, height };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}
function encodePng({ data, width, height }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [source, target] = process.argv.slice(2);
const html = fs.readFileSync(source, 'utf8');
const drawCode = html.slice(html.indexOf('// <draw>'), html.indexOf('// </draw>'));
const sandbox = { Math, Object, Array };
vm.createContext(sandbox);
vm.runInContext(`${drawCode}\nthis.out = { DRAW, ROWS, CW, CH, BASE };`, sandbox);
const { DRAW, ROWS, CW, CH, BASE } = sandbox.out;
const canvas = makeCanvas(CW * 6, CH * 3);
ROWS.forEach((frames, row) => frames.forEach((p, col) => DRAW(canvas.ctx, col * CW, row * CH + BASE + p.dy, p)));
fs.writeFileSync(target, encodePng(canvas));
console.log(`${target}: ${canvas.width}x${canvas.height}`);
