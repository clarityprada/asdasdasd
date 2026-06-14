(() => {
  'use strict';

  const fileInput = document.getElementById('fileInput');
  const patchBtn = document.getElementById('patchBtn');
  const statusEl = document.getElementById('status');
  const sizeWarningEl = document.getElementById('sizeWarning');
  const sizeWarningCloseBtn = document.getElementById('sizeWarningClose');
  const sizeWarningTitleEl = document.getElementById('sizeWarningTitle');
  const sizeWarningBodyEl = sizeWarningEl ? sizeWarningEl.querySelector('.cu-warning-body') : null;
  const i18nEls = Array.from(document.querySelectorAll('[data-i18n]'));

  const SIZE_WARNING_BYTES = 50 * 1024 * 1024;

  const COPY = {
    title: 'Pascha',
    selectVideo: 'Choose video',
    patchDownload: 'PATCH',
    ready: 'Ready',
    selected: 'Ready: {name}',
    scanning: 'Processing: applying 10x sample-count patch',
    patched: 'Processing: {realSamples}+{fakeSamples} listed samples. Downloading',
    downloaded: 'Done: file downloaded',
    failed: 'Error: {message}',
    sizeWarningKicker: 'File size warning',
    sizeWarningTitle: 'Video exceeds recommended settings',
    sizeWarningBody: 'The uploaded video exceeds the recommended upload settings. Recommended maximum: 50 MB, 1080p, 60 FPS.',
    close: 'Close',
  };

  let selectedFile = null;
  let currentStatus = { key: 'ready', state: 'idle', values: {} };

  function formatCopy(template, values = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
  }

  function t(key, values = {}) {
    return formatCopy(COPY[key] || key, values);
  }

  function setStatus(key, state = 'idle', values = {}) {
    currentStatus = { key, state, values };
    statusEl.textContent = t(key, values);
    statusEl.dataset.state = state;
  }

  function initCopy() {
    i18nEls.forEach((el) => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    fileInput.setAttribute('aria-label', t('selectVideo'));
    setStatus(currentStatus.key, currentStatus.state, currentStatus.values);
  }

  function showSizeWarning(details = []) {
    if (sizeWarningTitleEl) sizeWarningTitleEl.textContent = t('sizeWarningTitle');
    if (sizeWarningBodyEl) {
      const detailText = details.length ? ` Detected: ${details.join(', ')}.` : '';
      sizeWarningBodyEl.textContent = `${t('sizeWarningBody')}${detailText}`;
    }
    sizeWarningEl.hidden = false;
  }

  function hideSizeWarning() {
    sizeWarningEl.hidden = true;
  }

  function collectWarningDetails(file, info = null) {
    const details = [];
    if (file && file.size > SIZE_WARNING_BYTES) details.push(`${fmtBytes(file.size)} file size`);
    if (info && info.video && info.video.tkhd) {
      const w = Math.round(info.video.tkhd.width || 0);
      const h = Math.round(info.video.tkhd.height || 0);
      const shortSide = Math.min(w, h);
      if (shortSide > 1080) details.push(`${w}x${h} resolution`);
    }
    if (info && info.frameRate && info.frameRate > 60.01) details.push(`${info.frameRate.toFixed(2)} FPS`);
    return details;
  }

  const FAKE_SAMPLE = new Uint8Array([0x00,0x00,0x00,0x04,0x00,0x00,0x00,0x00]);
  const U32_MAX = 0xffffffff;
  const U64_LIMIT = Number.MAX_SAFE_INTEGER;

  function fmtSec(s){ return `${s.toFixed(3)}s`; }
  function fmtBytes(n){
    const u=['B','KB','MB','GB']; let i=0, v=n;
    while(v>=1024 && i<u.length-1){v/=1024;i++;}
    return `${v.toFixed(i?2:0)} ${u[i]}`;
  }
  function fmtMbps(bits, sec){ return sec > 0 ? `${(bits/sec/1000000).toFixed(2)} Mbps` : 'n/a'; }

  function typeAt(bytes, off){
    return String.fromCharCode(bytes[off], bytes[off+1], bytes[off+2], bytes[off+3]);
  }
  function dv(bytes){ return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function readU32(bytes, off){ return dv(bytes).getUint32(off, false); }
  function readI32(bytes, off){ return dv(bytes).getInt32(off, false); }
  function readU64(bytes, off){
    const v = dv(bytes), hi = v.getUint32(off, false), lo = v.getUint32(off+4, false);
    return hi * 4294967296 + lo;
  }
  function readI64(bytes, off){
    const hi = dv(bytes).getInt32(off, false), lo = dv(bytes).getUint32(off+4, false);
    return hi * 4294967296 + lo;
  }
  function writeU32(bytes, off, val){
    if (!Number.isFinite(val) || val < 0 || val > U32_MAX) throw new Error(`uint32 overflow writing ${val}`);
    dv(bytes).setUint32(off, Math.round(val), false);
  }
  function writeI32(bytes, off, val){ dv(bytes).setInt32(off, Math.round(val), false); }
  function writeU64(bytes, off, val){
    if (!Number.isFinite(val) || val < 0 || val > U64_LIMIT) throw new Error(`uint64 value too large for browser-safe patch: ${val}`);
    const hi = Math.floor(val / 4294967296), lo = Math.round(val - hi * 4294967296);
    const v = dv(bytes); v.setUint32(off, hi, false); v.setUint32(off+4, lo, false);
  }
  function writeI64(bytes, off, val){
    if (!Number.isFinite(val) || Math.abs(val) > U64_LIMIT) throw new Error(`int64 value too large for browser-safe patch: ${val}`);
    if (val >= 0) return writeU64(bytes, off, val);
    // two's complement for safe negative values
    const pos = Math.pow(2,64) + val;
    const hi = Math.floor(pos / 4294967296), lo = Math.round(pos - hi * 4294967296);
    const v = dv(bytes); v.setUint32(off, hi, false); v.setUint32(off+4, lo, false);
  }

  function boxSizeAt(bytes, off, end){
    if (off + 8 > end) throw new Error('Truncated MP4 box header.');
    let size = readU32(bytes, off), header = 8;
    const type = typeAt(bytes, off+4);
    if (size === 1) { size = readU64(bytes, off+8); header = 16; }
    else if (size === 0) { size = end - off; }
    if (size < header || off + size > end) throw new Error(`Bad MP4 box ${type} at ${off}, size ${size}.`);
    return {type, size, header, start:off, end:off+size};
  }
  function parseBoxes(bytes, start, end){
    const out=[]; let pos=start;
    while(pos + 8 <= end){ const b=boxSizeAt(bytes,pos,end); out.push(b); pos=b.end; }
    return out;
  }
  function headerSize(box){ return readU32(box,0) === 1 ? 16 : 8; }
  function boxType(box){ return typeAt(box,4); }
  function childStart(box){
    const t = boxType(box), h = headerSize(box);
    return t === 'meta' ? h + 4 : h;
  }
  function children(box){ return parseBoxes(box, childStart(box), box.length); }
  function findChild(box, type){
    for (const b of children(box)) if (b.type === type) return box.slice(b.start, b.end);
    return null;
  }
  function findPath(box, path){
    let cur = box;
    for (const t of path){ cur = findChild(cur, t); if (!cur) return null; }
    return cur;
  }
  function concat(parts){
    const size = parts.reduce((n,p)=>n+p.length,0), out = new Uint8Array(size);
    let o=0; for (const p of parts){ out.set(p,o); o+=p.length; }
    return out;
  }
  function makeBox(type, payload, large=false){
    const size = payload.length + (large ? 16 : 8);
    const out = new Uint8Array(size);
    if (large){ writeU32(out,0,1); out.set([...type].map(c=>c.charCodeAt(0)),4); writeU64(out,8,size); out.set(payload,16); }
    else { writeU32(out,0,size); out.set([...type].map(c=>c.charCodeAt(0)),4); out.set(payload,8); }
    return out;
  }
  function rebuildContainer(box, mapChild){
    const t = boxType(box), h = headerSize(box), cs = childStart(box);
    const prefix = box.slice(h, cs);
    const parts = [prefix];
    for (const b of parseBoxes(box, cs, box.length)) {
      const child = box.slice(b.start, b.end);
      parts.push(mapChild(child, b.type));
    }
    return makeBox(t, concat(parts), h === 16);
  }

  function parseMvhd(mvhd){
    const version = mvhd[headerSize(mvhd)];
    if (version === 0) return {version, timescale:readU32(mvhd,20), duration:readU32(mvhd,24)};
    return {version, timescale:readU32(mvhd,28), duration:readU64(mvhd,32)};
  }
  function patchMvhd(mvhd, newDuration){
    const out = new Uint8Array(mvhd);
    const version = out[headerSize(out)];
    if (version === 0) writeU32(out,24,newDuration); else writeU64(out,32,newDuration);
    return out;
  }
  function parseTkhd(tkhd){
    const version = tkhd[headerSize(tkhd)];
    const widthOff = version === 0 ? 84 : 96;
    const heightOff = version === 0 ? 88 : 100;
    return {
      version,
      duration: version === 0 ? readU32(tkhd,28) : readU64(tkhd,36),
      width: readU32(tkhd,widthOff) / 65536,
      height: readU32(tkhd,heightOff) / 65536,
    };
  }
  function patchTkhd(tkhd, newDuration){
    const out = new Uint8Array(tkhd);
    const version = out[headerSize(out)];
    if (version === 0) writeU32(out,28,newDuration); else writeU64(out,36,newDuration);
    return out;
  }
  function parseMdhd(mdhd){
    const version = mdhd[headerSize(mdhd)];
    if (version === 0) return {version, timescale:readU32(mdhd,20), duration:readU32(mdhd,24)};
    return {version, timescale:readU32(mdhd,28), duration:readU64(mdhd,32)};
  }
  function patchMdhd(mdhd, newDuration){
    const out = new Uint8Array(mdhd);
    const version = out[headerSize(out)];
    if (version === 0) writeU32(out,24,newDuration); else writeU64(out,32,newDuration);
    return out;
  }
  function handlerType(trak){
    const hdlr = findPath(trak, ['mdia','hdlr']);
    if (!hdlr) return '';
    return typeAt(hdlr, headerSize(hdlr)+8);
  }
  function stsdCodec(stsd){
    if (!stsd) return '';
    const entryCount = readU32(stsd, 12);
    if (!entryCount) return '';
    return typeAt(stsd, 16+4);
  }
  function parseStts(stts){
    const n = readU32(stts,12);
    let sampleCount=0, totalTicks=0, lastDelta=0;
    const entries = [];
    const deltaWeight = new Map();
    for(let i=0;i<n;i++){
      const o=16+i*8, c=readU32(stts,o), d=readU32(stts,o+4);
      entries.push({count:c, delta:d});
      sampleCount += c; totalTicks += c*d; lastDelta = d;
      deltaWeight.set(d, (deltaWeight.get(d) || 0) + c);
    }
    let primaryDelta = lastDelta, bestCount = -1;
    for (const [delta,count] of deltaWeight.entries()) {
      if (count > bestCount) { bestCount = count; primaryDelta = delta; }
    }
    return {entryCount:n, entries, sampleCount, totalTicks, lastDelta, primaryDelta};
  }
  function parseStsz(stsz){
    const sampleSize = readU32(stsz,12), sampleCount = readU32(stsz,16);
    let trailingEight=0;
    if (sampleSize === 0) {
      for (let i=sampleCount-1; i>=0 && i>=sampleCount-5000; i--) {
        if (readU32(stsz,20+i*4) === 8) trailingEight++; else break;
      }
    }
    return {sampleSize, sampleCount, trailingEight};
  }
  function parseStsc(stsc){
    const n = readU32(stsc,12);
    if (!n) throw new Error('Video stsc has no entries.');
    const o = 16+(n-1)*12;
    return {entryCount:n, lastFirstChunk:readU32(stsc,o), lastSamplesPerChunk:readU32(stsc,o+4), lastDescId:readU32(stsc,o+8)};
  }
  function parseChunkTable(stcoOrCo64){
    const t = boxType(stcoOrCo64), n = readU32(stcoOrCo64,12);
    return {type:t, count:n};
  }
  function parseElst(elst){
    if (!elst) return null;
    const version = elst[headerSize(elst)], entryCount = readU32(elst,12);
    if (!entryCount) return null;
    if (version === 0) return {version, entryCount, segmentDuration:readU32(elst,16), mediaTime:readI32(elst,20)};
    return {version, entryCount, segmentDuration:readU64(elst,16), mediaTime:readI64(elst,24)};
  }
  function patchElst(elst, newSegmentDuration){
    const out = new Uint8Array(elst), version = out[headerSize(out)];
    if (version === 0) writeU32(out,16,newSegmentDuration); else writeU64(out,16,newSegmentDuration);
    return out;
  }

  function analyzeMoov(moov, opts){
    const mvhd = findChild(moov,'mvhd');
    if (!mvhd) throw new Error('No mvhd atom found.');
    const movie = parseMvhd(mvhd);
    if (!movie.timescale) throw new Error('Movie timescale is zero.');

    let video = null;
    for (const b of children(moov)) {
      if (b.type !== 'trak') continue;
      const trak = moov.slice(b.start,b.end);
      if (handlerType(trak) !== 'vide') continue;
      const tkhd = findChild(trak,'tkhd');
      const mdhd = findPath(trak,['mdia','mdhd']);
      const stbl = findPath(trak,['mdia','minf','stbl']);
      if (!tkhd || !mdhd || !stbl) continue;
      const stsd = findChild(stbl,'stsd'), stsz = findChild(stbl,'stsz'), stts = findChild(stbl,'stts'), stsc = findChild(stbl,'stsc');
      const stco = findChild(stbl,'stco') || findChild(stbl,'co64');
      if (!stsz || !stts || !stsc || !stco) throw new Error('Video track is missing stsz/stts/stsc/stco atoms.');
      const codec = stsdCodec(stsd);
      if (codec !== 'avc1' && codec !== 'avc3') throw new Error(`Video codec sample entry is ${codec || 'unknown'}, not avc1/avc3. This exact fake sample patch is AVC/H.264-only.`);
      const tk = parseTkhd(tkhd), md = parseMdhd(mdhd), ts = parseStts(stts), sz = parseStsz(stsz), sc = parseStsc(stsc), co = parseChunkTable(stco);
      if (sz.sampleSize !== 0) throw new Error('Fixed-size stsz video samples are not supported.');
      if (ts.sampleCount !== sz.sampleCount) throw new Error(`stts sample count (${ts.sampleCount}) does not match stsz sample count (${sz.sampleCount}).`);
      if (!ts.primaryDelta) throw new Error('Could not read frame delta from stts.');
      const elst = parseElst(findPath(trak,['edts','elst']));
      video = {codec, tkhd:tk, mdhd:md, stts:ts, stsz:sz, stsc:sc, chunks:co, elst};
      break;
    }
    if (!video) throw new Error('No AVC/H.264 video track found.');

    const frameRate = video.mdhd.timescale / video.stts.primaryDelta;
    const targetFrames = video.stsz.sampleCount * 10;
    const fakeCount = targetFrames - video.stsz.sampleCount;
    if (fakeCount < 1) throw new Error('Target sample count is not higher than the current video. Nothing to patch.');
    if (fakeCount > 250000) throw new Error(`Refusing to add ${fakeCount} fake samples. Use a shorter source or lower multiplier.`);

    const fakeTicks = fakeCount * video.stts.primaryDelta;
    const newSttsTotal = video.stts.totalTicks + fakeTicks;

    return {movie, video, frameRate, targetFrames, fakeCount, fakeTicks, newSttsTotal};
  }

  function patchStts(stts, fakeCount, fakeDelta){
    const n = readU32(stts,12);
    if (!n) throw new Error('Cannot patch empty stts.');
    const last = 16+(n-1)*8;
    const lastDelta = readU32(stts,last+4);
    if (lastDelta === fakeDelta) {
      const out = new Uint8Array(stts);
      writeU32(out,last,readU32(out,last)+fakeCount);
      return out;
    }
    const oldPayload = stts.slice(headerSize(stts));
    const payload = new Uint8Array(oldPayload.length + 8);
    payload.set(oldPayload,0);
    writeU32(payload,4,n+1);
    const o = oldPayload.length;
    writeU32(payload,o,fakeCount);
    writeU32(payload,o+4,fakeDelta);
    return makeBox('stts', payload, headerSize(stts) === 16);
  }
  function patchCtts(ctts, fakeCount){
    const n = readU32(ctts,12);
    if (!n) return ctts;
    const last = 16+(n-1)*8;
    const version = ctts[headerSize(ctts)];
    const lastOffset = version === 0 ? readU32(ctts,last+4) : readI32(ctts,last+4);
    if (lastOffset === 0) {
      const out = new Uint8Array(ctts);
      writeU32(out,last,readU32(out,last)+fakeCount);
      return out;
    }
    const payload = new Uint8Array(ctts.length - headerSize(ctts) + 8);
    payload.set(ctts.slice(headerSize(ctts)),0);
    writeU32(payload,4,n+1);
    const o = payload.length - 8;
    writeU32(payload,o,fakeCount); writeU32(payload,o+4,0);
    return makeBox('ctts', payload, headerSize(ctts) === 16);
  }

  function patchSdtp(sdtp, fakeCount){
    // sdtp is one dependency byte per sample after the full-box header.
    // 0x10 marks a simple disposable/non-key sample; exact value is not critical for the invalid fake tail.
    const payload = new Uint8Array(sdtp.length - headerSize(sdtp) + fakeCount);
    payload.set(sdtp.slice(headerSize(sdtp)),0);
    payload.fill(0x10, sdtp.length - headerSize(sdtp));
    return makeBox('sdtp', payload, headerSize(sdtp) === 16);
  }
  function patchStsz(stsz, fakeCount){
    const oldPayload = stsz.slice(headerSize(stsz));
    const payload = new Uint8Array(oldPayload.length + fakeCount*4);
    payload.set(oldPayload,0);
    const oldCount = readU32(stsz,16);
    writeU32(payload,8,oldCount + fakeCount); // sample_count is payload offset 8
    let o = oldPayload.length;
    for(let i=0;i<fakeCount;i++,o+=4) writeU32(payload,o,8);
    return makeBox('stsz', payload, headerSize(stsz) === 16);
  }
  function patchStsc(stsc, firstChunk, descId){
    const oldPayload = stsc.slice(headerSize(stsc));
    const payload = new Uint8Array(oldPayload.length + 12);
    payload.set(oldPayload,0);
    const n = readU32(stsc,12);
    writeU32(payload,4,n+1); // entry_count payload offset 4
    const o = oldPayload.length;
    writeU32(payload,o,firstChunk);
    writeU32(payload,o+4,1); // each fake chunk maps to exactly 1 fake sample
    writeU32(payload,o+8,descId);
    return makeBox('stsc', payload, headerSize(stsc) === 16);
  }
  function patchChunkOffsets(stco, shift, appendOffsetOrNull, repeatCount = 1){
    const t = boxType(stco), oldPayload = stco.slice(headerSize(stco));
    const step = t === 'co64' ? 8 : 4;
    const oldCount = readU32(stco,12);
    const add = appendOffsetOrNull == null ? 0 : repeatCount;
    const payload = new Uint8Array(oldPayload.length + add*step);
    payload.set(oldPayload,0);
    writeU32(payload,4,oldCount+add);
    for(let i=0;i<oldCount;i++){
      const po = 8+i*step;
      const old = step === 8 ? readU64(stco,headerSize(stco)+po) : readU32(stco,headerSize(stco)+po);
      const val = old + shift;
      if (step === 8) writeU64(payload,po,val); else writeU32(payload,po,val);
    }
    for(let i=0;i<add;i++){
      const po = 8+(oldCount+i)*step;
      if (step === 8) writeU64(payload,po,appendOffsetOrNull); else writeU32(payload,po,appendOffsetOrNull);
    }
    return makeBox(t, payload, headerSize(stco) === 16);
  }

  function buildPatchedMoov(moov, info, shiftExistingOffsets, fakeChunkOffset){
    function rebuildStbl(stbl, isVideo){
      return rebuildContainer(stbl, (child,t) => {
        if (t === 'stco' || t === 'co64') return patchChunkOffsets(child, shiftExistingOffsets, isVideo ? fakeChunkOffset : null, isVideo ? info.fakeCount : 1);
        if (!isVideo) return child;
        if (t === 'stts') return patchStts(child, info.fakeCount, info.video.stts.primaryDelta);
        if (t === 'ctts') return patchCtts(child, info.fakeCount);
        if (t === 'sdtp') return patchSdtp(child, info.fakeCount);
        if (t === 'stsz') return patchStsz(child, info.fakeCount);
        if (t === 'stsc') return patchStsc(child, info.video.chunks.count + 1, info.video.stsc.lastDescId);
        return child;
      });
    }
    function rebuildMinf(minf, isVideo){ return rebuildContainer(minf, (child,t)=> t === 'stbl' ? rebuildStbl(child,isVideo) : child); }
    function rebuildMdia(mdia, isVideo){
      return rebuildContainer(mdia, (child,t) => {
        if (t === 'minf') return rebuildMinf(child,isVideo);
        return child;
      });
    }
    function rebuildTrak(trak){
      const isVideo = handlerType(trak) === 'vide';
      return rebuildContainer(trak, (child,t) => {
        if (t === 'mdia') return rebuildMdia(child,isVideo);
        return child;
      });
    }
    return rebuildContainer(moov, (child,t) => {
      if (t === 'trak') return rebuildTrak(child);
      return child;
    });
  }

  function makeFakeData(fakeCount){
    // The 10x method stores one invalid AVC sample and points every fake stco entry to it.
    return new Uint8Array(FAKE_SAMPLE);
  }
  function patchMdat(mdat, fakeData){
    const h = headerSize(mdat), oldSize = readU32(mdat,0) === 1 ? readU64(mdat,8) : readU32(mdat,0);
    if (readU32(mdat,0) === 0) throw new Error('mdat size=0 is not supported.');
    const newSize = oldSize + fakeData.length;
    const out = new Uint8Array(mdat.length + fakeData.length);
    out.set(mdat,0); out.set(fakeData,mdat.length);
    if (h === 16) writeU64(out,8,newSize);
    else {
      if (newSize > U32_MAX) throw new Error('Patched mdat would exceed 4GB; this simple HTML keeps 32-bit mdat boxes only.');
      writeU32(out,0,newSize);
    }
    return out;
  }

  function findTop(bytes){
    const boxes = parseBoxes(bytes,0,bytes.length);
    const moov = boxes.find(b=>b.type==='moov'), mdat = boxes.find(b=>b.type==='mdat');
    if (!moov) throw new Error('No moov atom found.');
    if (!mdat) throw new Error('No mdat atom found.');
    return {boxes, moov, mdat};
  }


  function buildPaschaPatch(file, bytes) {
    const top = findTop(bytes);
    const moovBytes = bytes.slice(top.moov.start, top.moov.end);
    const mdatBytes = bytes.slice(top.mdat.start, top.mdat.end);
    const info = analyzeMoov(moovBytes, {});

    if (info.video.stsz.trailingEight >= 100 && info.video.stsz.trailingEight > info.video.stsz.sampleCount * 0.08) {
      throw new Error(`This file already looks patched (${info.video.stsz.trailingEight} trailing 8-byte samples). Use a clean export instead.`);
    }

    const testMoov = buildPatchedMoov(moovBytes, info, 0, 0);
    const moovDelta = testMoov.length - moovBytes.length;
    const moovBeforeMdat = top.moov.start < top.mdat.start;
    const shiftExistingOffsets = moovBeforeMdat ? moovDelta : 0;
    const oldMdatHeader = top.mdat.header;
    const oldMdatDataSize = top.mdat.size - oldMdatHeader;
    const newMdatStart = top.mdat.start + (moovBeforeMdat ? moovDelta : 0);
    const fakeChunkOffset = newMdatStart + oldMdatHeader + oldMdatDataSize;
    const finalMoov = buildPatchedMoov(moovBytes, info, shiftExistingOffsets, fakeChunkOffset);
    const fakeData = makeFakeData(info.fakeCount);
    const finalMdat = patchMdat(mdatBytes, fakeData);

    const parts = [];
    for (const b of top.boxes) {
      if (b.type === 'moov') parts.push(finalMoov);
      else if (b.type === 'mdat') parts.push(finalMdat);
      else parts.push(bytes.slice(b.start,b.end));
    }

    const output = concat(parts);
    const originalName = file.name.replace(/\.[^/.]+$/, '');
    return {
      output,
      filename: `${originalName}_pascha_patched.mp4`,
      realSamples: info.video.stsz.sampleCount,
      fakeSamples: info.fakeCount,
      warningDetails: collectWarningDetails(file, info),
    };
  }

  fileInput.addEventListener('change', (e) => {
    selectedFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (selectedFile) {
      patchBtn.disabled = false;
      document.body.classList.add('has-file');
      setStatus('selected', 'idle', { name: selectedFile.name });
      const details = collectWarningDetails(selectedFile);
      if (details.length) showSizeWarning(details);
      else hideSizeWarning();
    } else {
      patchBtn.disabled = true;
      document.body.classList.remove('has-file');
      hideSizeWarning();
      setStatus('ready', 'idle');
    }
  });

  patchBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    patchBtn.disabled = true;
    setStatus('scanning', 'processing');

    try {
      const bytes = new Uint8Array(await selectedFile.arrayBuffer());
      const patch = buildPaschaPatch(selectedFile, bytes);
      if (patch.warningDetails && patch.warningDetails.length) showSizeWarning(patch.warningDetails);
      setStatus('patched', 'processing', { realSamples: patch.realSamples, fakeSamples: patch.fakeSamples });

      const blob = new Blob([patch.output], { type: selectedFile.type || 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = patch.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('downloaded', 'success');
    } catch (err) {
      setStatus('failed', 'error', { message: err && err.message ? err.message : 'unknown error' });
    } finally {
      patchBtn.disabled = false;
    }
  });

  sizeWarningCloseBtn.addEventListener('click', hideSizeWarning);
  initCopy();
})();
