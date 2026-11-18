(function (global) {
  'use strict';

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8(text) {
    return new TextEncoder().encode(String(text));
  }

  function dosDateTime(date) {
    var d = date || new Date();
    var year = Math.max(1980, d.getFullYear());
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var day = (((year - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time & 0xffff, date: day & 0xffff };
  }

  function u16(view, offset, value) {
    view.setUint16(offset, value & 0xffff, true);
  }

  function u32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function normalizeEntries(entries) {
    var out = [];
    Object.keys(entries || {}).forEach(function (name) {
      var value = entries[name];
      var data;
      if (value instanceof Uint8Array) data = value;
      else if (typeof value === 'string') data = utf8(value);
      else if (value && value.bytes instanceof Uint8Array) data = value.bytes;
      else if (value && typeof value.text === 'string') data = utf8(value.text);
      else data = utf8(JSON.stringify(value == null ? null : value));
      var clean = String(name).replace(/\\/g, '/').replace(/^\/+/, '');
      var bytes = utf8(clean);
      out.push({ nameBytes: bytes, data: data, crc: crc32(data), offset: 0 });
    });
    return out;
  }

  function write(entries) {
    var files = normalizeEntries(entries);
    var stamp = dosDateTime(new Date());
    var localParts = [];
    var centralParts = [];
    var offset = 0;

    files.forEach(function (file) {
      var header = new Uint8Array(30 + file.nameBytes.length);
      var view = new DataView(header.buffer);
      u32(view, 0, 0x04034b50);
      u16(view, 4, 20);
      u16(view, 6, 0x0800);
      u16(view, 8, 0);
      u16(view, 10, stamp.time);
      u16(view, 12, stamp.date);
      u32(view, 14, file.crc);
      u32(view, 18, file.data.length);
      u32(view, 22, file.data.length);
      u16(view, 26, file.nameBytes.length);
      u16(view, 28, 0);
      header.set(file.nameBytes, 30);
      localParts.push(header, file.data);
      file.offset = offset;
      offset += header.length + file.data.length;
    });

    var centralSize = 0;
    files.forEach(function (file) {
      var header = new Uint8Array(46 + file.nameBytes.length);
      var view = new DataView(header.buffer);
      u32(view, 0, 0x02014b50);
      u16(view, 4, 20);
      u16(view, 6, 20);
      u16(view, 8, 0x0800);
      u16(view, 10, 0);
      u16(view, 12, stamp.time);
      u16(view, 14, stamp.date);
      u32(view, 16, file.crc);
      u32(view, 20, file.data.length);
      u32(view, 24, file.data.length);
      u16(view, 28, file.nameBytes.length);
      u16(view, 30, 0);
      u16(view, 32, 0);
      u16(view, 34, 0);
      u16(view, 36, 0);
      u32(view, 38, 0);
      u32(view, 42, file.offset);
      header.set(file.nameBytes, 46);
      centralParts.push(header);
      centralSize += header.length;
    });

    var end = new Uint8Array(22);
    var endView = new DataView(end.buffer);
    u32(endView, 0, 0x06054b50);
    u16(endView, 4, 0);
    u16(endView, 6, 0);
    u16(endView, 8, files.length);
    u16(endView, 10, files.length);
    u32(endView, 12, centralSize);
    u32(endView, 16, offset);
    u16(endView, 20, 0);

    var all = localParts.concat(centralParts, [end]);
    var total = all.reduce(function (sum, part) { return sum + part.length; }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    all.forEach(function (part) { out.set(part, pos); pos += part.length; });
    return out;
  }

  function readU16(view, offset) { return view.getUint16(offset, true); }
  function readU32(view, offset) { return view.getUint32(offset, true); }

  function findEnd(view) {
    var min = Math.max(0, view.byteLength - 65557);
    for (var i = view.byteLength - 22; i >= min; i--) {
      if (readU32(view, i) === 0x06054b50) return i;
    }
    return -1;
  }

  function inflateRaw(data) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('このブラウザは圧縮ZIPの展開に対応していません');
    }
    var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
  }

  function read(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var end = findEnd(view);
    if (end < 0) return Promise.reject(new Error('ZIPの終端が見つかりません'));
    var count = readU16(view, end + 10);
    var centralOffset = readU32(view, end + 16);
    var files = {};
    var pos = centralOffset;

    for (var i = 0; i < count; i++) {
      if (readU32(view, pos) !== 0x02014b50) break;
      var method = readU16(view, pos + 10);
      var compressedSize = readU32(view, pos + 20);
      var nameLength = readU16(view, pos + 28);
      var extraLength = readU16(view, pos + 30);
      var commentLength = readU16(view, pos + 32);
      var localOffset = readU32(view, pos + 42);
      var nameBytes = bytes.slice(pos + 46, pos + 46 + nameLength);
      var name = new TextDecoder().decode(nameBytes);
      var localNameLength = readU16(view, localOffset + 26);
      var localExtraLength = readU16(view, localOffset + 28);
      var dataStart = localOffset + 30 + localNameLength + localExtraLength;
      var data = bytes.slice(dataStart, dataStart + compressedSize);
      files[name] = { name: name, method: method, data: data };
      pos += 46 + nameLength + extraLength + commentLength;
    }

    var names = Object.keys(files);
    return Promise.all(names.map(function (name) {
      var file = files[name];
      if (file.method === 0) return Promise.resolve(file.data);
      if (file.method === 8) return inflateRaw(file.data);
      throw new Error('未対応のZIP圧縮方式です: ' + file.method);
    })).then(function (contents) {
      var out = {};
      names.forEach(function (name, index) {
        var bytesOut = contents[index];
        out[name] = {
          bytes: bytesOut,
          text: function () { return new TextDecoder().decode(bytesOut); }
        };
      });
      out.text = function (name) {
        return out[name] ? out[name].text() : '';
      };
      return out;
    });
  }

  global.VersePaintZip = { write: write, read: read, crc32: crc32 };
})(window);
