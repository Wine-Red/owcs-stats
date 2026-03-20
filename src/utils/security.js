/**
 * 安全相关工具函数
 */

/**
 * 转义 HTML 特殊字符，防止 XSS 攻击
 * @param {any} unsafe - 需要转义的值，通常为字符串
 * @returns {string} 转义后的安全字符串
 */
export function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  
  // 如果不是字符串，则转为字符串处理
  const str = String(unsafe);
  
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
