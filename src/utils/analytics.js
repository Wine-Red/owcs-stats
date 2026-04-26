/**
 * Analytics Service wrapper for Umami
 * https://umami.is/docs/tracker-functions
 */

/**
 * 记录自定义事件
 * @param {string} eventName 事件名称
 * @param {object} eventData 事件携带的数据
 */
export const trackEvent = (eventName, eventData = {}) => {
  try {
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track(eventName, eventData);
    } else {
      // 降级处理，如果在开发环境或是被 AdBlock 拦截，则在控制台打印
      if (import.meta.env.DEV) {
        console.log(`[Umami Track] Event: ${eventName}`, eventData);
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Umami Track] Error tracking event:', error);
    }
  }
};

/**
 * 记录性能指标
 * @param {string} metricName 指标名称 (例如 page_load_duration)
 * @param {number} duration 耗时 (毫秒)
 */
export const trackPerformance = (metricName, duration) => {
  // 我们将性能指标作为自定义事件发送，附带 duration
  trackEvent('performance_metric', { 
    metric: metricName, 
    duration: Math.round(duration) 
  });
};

/**
 * 记录错误/异常
 * @param {string} source 错误来源 (例如 API 路径或组件名)
 * @param {Error|string} error 错误对象或信息
 */
export const trackError = (source, error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  trackEvent('exception_error', { 
    source, 
    message: errorMessage 
  });
};

export default {
  trackEvent,
  trackPerformance,
  trackError
};
