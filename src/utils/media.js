export const resolveMediaUrl = value => {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^(?:https?:|data:|blob:)/i.test(source)) return source;
  if (source.startsWith('/')) return source;
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${baseUrl}${source.replace(/^\.\//, '')}`;
};

export const mediaSourceState = value => {
  const source = String(value || '').trim();
  if (!source) return { key: 'missing', label: '未配置', type: 'info' };
  if (source.startsWith('/media/')) return { key: 'managed', label: '已托管', type: 'success' };
  if (/^https?:\/\//i.test(source)) return { key: 'external', label: '外部来源', type: 'warning' };
  return { key: 'legacy', label: '旧版资源', type: 'warning' };
};
