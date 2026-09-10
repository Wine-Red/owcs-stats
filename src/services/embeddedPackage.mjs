import { gunzipSync, strFromU8 } from 'fflate';

export const EMBEDDED_PACKAGE_ID = 'owcs-package-resources';
export const createEmbeddedReader = payload => {
  if (payload?.schemaVersion !== 1 || !payload.files) throw new Error('页面包格式不兼容，请重新上传完整页面');
  const assets = new Map();
  const entry = path => payload.files[path.replace(/^(?:\.\/|\/)/, '').split('?')[0]];
  const bytes = record => {
    const encoded = Uint8Array.from(atob(record.data), char => char.charCodeAt(0));
    return record.encoding === 'gzip' ? gunzipSync(encoded) : encoded;
  };
  return {
    json(path) {
      const record = entry(path);
      if (!record || record.type !== 'application/json') throw new Error(`页面包缺少数据：${path}`);
      // JSON stays compressed until the existing resource adapter requests it.
      return JSON.parse(strFromU8(bytes(record)));
    },
    asset(path) {
      if (!assets.has(path)) {
        const record = entry(path);
        if (!record || !record.type.startsWith('image/')) return '';
        assets.set(path, URL.createObjectURL(new Blob([bytes(record)], { type: record.type })));
      }
      return assets.get(path);
    }
  };
};

let reader;
export const embeddedPackage = () => {
  if (!reader) {
    const node = document.getElementById(EMBEDDED_PACKAGE_ID);
    if (!node) throw new Error('页面包不完整，请重新上传 index.html');
    reader = createEmbeddedReader(JSON.parse(node.textContent));
    // Release the duplicate DOM copy of the encoded resources.
    node.remove();
  }
  return reader;
};
