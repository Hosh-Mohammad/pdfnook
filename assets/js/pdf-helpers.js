/* ToolNest PDF — shared pdf-lib helpers used by the tool scripts. */
(function () {
  'use strict';
  function loadPdf(PDFLib, bytes, name) {
    return PDFLib.PDFDocument.load(bytes).catch(function (e) {
      if (/encrypted/i.test(e.message)) throw new Error((name || 'This PDF') + ' is password-protected. Please unlock it first with the Unlock PDF tool.');
      throw new Error('Could not read ' + (name || 'the PDF') + '. It may be damaged or use an unsupported feature.');
    });
  }
  function newDoc(PDFLib) {
    return PDFLib.PDFDocument.create().then(function (d) { d.setProducer('ToolNest PDF'); d.setCreator('ToolNest PDF'); return d; });
  }
  function toBlob(doc) {
    return doc.save({ useObjectStreams: true }).then(function (b) { return new Blob([b], { type: 'application/pdf' }); });
  }
  function copyInto(target, src, indices) {
    return target.copyPages(src, indices).then(function (pages) { pages.forEach(function (p) { target.addPage(p); }); });
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function exifOrientation(u8) {
    // Minimal EXIF orientation reader for JPEG. Returns 1 when absent.
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) return 1;
    var off = 2;
    while (off + 4 < u8.length) {
      if (u8[off] !== 0xFF) return 1;
      var marker = u8[off + 1], len = (u8[off + 2] << 8) | u8[off + 3];
      if (marker === 0xE1 && u8[off + 4] === 0x45 && u8[off + 5] === 0x78) { // "Ex"
        var t = off + 10, le = u8[t] === 0x49;
        var rd16 = function (o) { return le ? u8[o] | (u8[o + 1] << 8) : (u8[o] << 8) | u8[o + 1]; };
        var rd32 = function (o) { return le ? (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) : ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]); };
        var ifd = t + rd32(t + 4), n = rd16(ifd);
        for (var i = 0; i < n; i++) { var e = ifd + 2 + i * 12; if (rd16(e) === 0x0112) return rd16(e + 8); }
        return 1;
      }
      if (marker === 0xDA) return 1;
      off += 2 + len;
    }
    return 1;
  }
  function isJpeg(u8) { return u8[0] === 0xFF && u8[1] === 0xD8; }
  function isPng(u8) { return u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47; }

  // Draw through a canvas (applies EXIF rotation, handles formats pdf-lib cannot embed directly).
  function reencode(blob, mime) {
    return createImageBitmap(blob).then(function (bmp) {
      var c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      var g = c.getContext('2d');
      if (mime === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      return new Promise(function (res, rej) { c.toBlob(function (b) { c.width = 0; c.height = 0; b ? res(b) : rej(new Error('Image conversion failed.')); }, mime, 0.92); });
    }).then(function (b) { return b.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); });
  }

  function embedImage(doc, file, bytes) {
    var jpeg = isJpeg(bytes), png = isPng(bytes);
    if (!jpeg && !png) return Promise.reject(new Error(file.name + ' is not a valid JPG or PNG image.'));
    if (jpeg) {
      var needsFix = exifOrientation(bytes) > 1;
      var attempt = needsFix ? Promise.reject(new Error('reencode')) : doc.embedJpg(bytes);
      return Promise.resolve(attempt).catch(function () {
        return reencode(file, 'image/jpeg').then(function (b) { return doc.embedJpg(b); });
      });
    }
    return doc.embedPng(bytes).catch(function () {
      return reencode(file, 'image/png').then(function (b) { return doc.embedPng(b); });
    });
  }


  // Map "visual" coordinates (origin at the bottom-left of the page as displayed) to PDF user space,
  // taking the page /Rotate value and MediaBox offset into account.
  function placement(page) {
    var mb = page.getMediaBox(), W = mb.width, Hh = mb.height;
    var rot = (((page.getRotation().angle || 0) % 360) + 360) % 360;
    var vw = rot % 180 ? Hh : W, vh = rot % 180 ? W : Hh;
    function toUser(vx, vy) {
      var x, y;
      if (rot === 0) { x = vx; y = vy; }
      else if (rot === 90) { x = W - vy; y = vx; }
      else if (rot === 180) { x = W - vx; y = Hh - vy; }
      else { x = vy; y = Hh - vx; }
      return { x: x + mb.x, y: y + mb.y };
    }
    return { vw: vw, vh: vh, rot: rot, toUser: toUser, angle: rot === 0 ? 0 : rot === 90 ? 90 : rot === 180 ? 180 : 270 };
  }
  window.ToolNestPdf = { loadPdf: loadPdf, newDoc: newDoc, toBlob: toBlob, copyInto: copyInto, range: range, embedImage: embedImage, placement: placement, exifOrientation: exifOrientation };
})();
