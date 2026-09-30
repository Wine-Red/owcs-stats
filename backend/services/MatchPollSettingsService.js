const Config = require('../models/Config');

const configKey = 'match_poll_settings';
const validateSettings = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || typeof value.enabled !== 'boolean') {
    throw Object.assign(new Error('投票设置只接受 enabled 布尔值'), { statusCode: 400 });
  }
  return { enabled: value.enabled };
};

const getStatus = async () => {
  const config = await Config.findByPk(configKey);
  // Preserve existing sites until an administrator explicitly changes the switch.
  if (!config) return { enabled: true };
  const value = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
  return validateSettings(value);
};

module.exports = { configKey, validateSettings, getStatus };
