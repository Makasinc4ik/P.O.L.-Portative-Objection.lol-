// zlib для main.js / zipimport.js на fflate
import { Buffer } from 'buffer';
import { gzipSync as gz, gunzipSync as gunz, inflateSync, deflateSync } from 'fflate';

const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
export const gzipSync = (b, o = {}) => Buffer.from(gz(u8(b), { level: o.level ?? 6 }));
export const gunzipSync = (b) => Buffer.from(gunz(u8(b)));
export const inflateRawSync = (b) => Buffer.from(inflateSync(u8(b)));
export const deflateRawSync = (b, o = {}) => Buffer.from(deflateSync(u8(b), { level: o.level ?? 6 }));
export default { gzipSync, gunzipSync, inflateRawSync, deflateRawSync };
