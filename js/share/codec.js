// Eigentümer: D – Austauschformat v1 (docs/ARCHITEKTUR.md §5). In Node importierbar.
/** @typedef {import('../types.js').ShareData} ShareData */
/** @typedef {import('../types.js').List} List */
/** @typedef {import('../types.js').Device} Device */
/** @typedef {import('../types.js').PartnerRanking} PartnerRanking */

export const MAX_PAYLOAD = 65536, MAX_INFLATED = 262144, MAX_OPTIONS = 500, MAX_NAME = 120;

export class ShareError extends Error {
  /** @param {'format'|'version'|'zu-gross'|'beschaedigt'} code @param {string} [message] */
  constructor(code, message) {
    super(message || code);
    this.name = 'ShareError';
    /** @type {'format'|'version'|'zu-gross'|'beschaedigt'} */
    this.code = code;
  }
}

/** @param {ShareData} data @returns {Promise<string>} "1.z.<b64url>" bzw. "1.j.<b64url>" */
export async function encodeShare(data) {
  throw new Error('TODO');
}

/** @param {string} payload @returns {Promise<ShareData>} wirft ShareError */
export async function decodeShare(payload) {
  throw new Error('TODO');
}

/** @param {string} payload @param {{origin:string, pathname:string}} [loc] @returns {string} origin+pathname+"#i="+payload */
export function buildShareUrl(payload, loc = globalThis.location) {
  throw new Error('TODO');
}

/** Akzeptiert URL, "#i=…" oder das nackte Payload. @param {string} textOrUrl @returns {string|null} */
export function extractPayload(textOrUrl) {
  throw new Error('TODO');
}

/** @param {List} list @param {Device} device @param {number} now ms @returns {ShareData} inkl. a = list.aliases */
export function toShareData(list, device, now) {
  throw new Error('TODO');
}

/** @param {ShareData} d @param {number} now ms @returns {PartnerRanking} sentAt = t*1000, receivedAt = now */
export function toPartnerRanking(d, now) {
  throw new Error('TODO');
}
