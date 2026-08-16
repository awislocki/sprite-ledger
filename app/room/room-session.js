// Per-device memory of a room: the host token that proves you started it.
// Scoped to one room code and disposable — losing it costs you the "mark
// complete" button and nothing else, since the room expires on its own.
//
// There is deliberately no "which player am I" here: anyone holding the link
// can add, rename, or remove anyone, so a device isn't tied to a seat.

const hostKey = (code) => `sprite-ledger:room-host:${code}`;

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
export const rememberHost = (code, token) => write(hostKey(code), token);
export const hostTokenFor = (code) => read(hostKey(code));
