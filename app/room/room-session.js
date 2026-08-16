// Per-device memory of a room: the host token (proves you started it) and
// which player you are (so a reload doesn't ask you to upload again). Both are
// scoped to one room code and both are disposable — losing them costs you the
// "mark complete" button and one re-upload, nothing more.

const hostKey = (code) => `sprite-ledger:room-host:${code}`;
const meKey = (code) => `sprite-ledger:room-me:${code}`;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
const clear = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {}
};

export const rememberHost = (code, token) => write(hostKey(code), token);
export const hostTokenFor = (code) => read(hostKey(code));

export const rememberMe = (code, name) => write(meKey(code), name);
export const meIn = (code) => read(meKey(code));
export const forgetMe = (code) => clear(meKey(code));
