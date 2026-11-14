// Мелкие модули Node, нужные только для сборки
export const pathToFileURL = (p) => new URL('file://' + encodeURI(String(p)));
export const fileURLToPath = (u) => decodeURI(new URL(String(u)).pathname);
export const Readable = { toWeb() { throw new Error('stream: нет на Android'); } };
export default { pathToFileURL, fileURLToPath, Readable };
