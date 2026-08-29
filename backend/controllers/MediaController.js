const Season = require('../models/Season');
const Team = require('../models/Team');
const Hero = require('../models/Hero');
const MapModel = require('../models/Map');
const { assertCategory, storeImage } = require('../services/MediaStorageService');

const CATEGORY_MODELS = Object.freeze({
  seasons: { model: Season, field: 'icon' },
  teams: { model: Team, field: 'logo' },
  heroes: { model: Hero, field: 'image' },
  maps: { model: MapModel, field: 'image' }
});

const resolveEntity = async (category, rawId) => {
  const normalizedCategory = assertCategory(category);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid entity id');
    error.statusCode = 400;
    throw error;
  }

  const descriptor = CATEGORY_MODELS[normalizedCategory];
  const entity = await descriptor.model.findByPk(id);
  if (!entity) {
    const error = new Error('Entity not found');
    error.statusCode = 404;
    throw error;
  }
  return { normalizedCategory, descriptor, entity };
};

const sendError = (res, error) => {
  const status = Number(error.statusCode) || 500;
  if (status >= 500) console.error('[media]', error);
  return res.status(status).json({ error: status >= 500 ? 'Media operation failed' : error.message });
};

const MediaController = {
  upload: async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Image file is required' });
      }
      const { normalizedCategory, descriptor, entity } = await resolveEntity(req.params.category, req.params.id);
      const stored = await storeImage(normalizedCategory, req.file.buffer);
      await entity.update({ [descriptor.field]: stored.path });
      return res.status(201).json({ asset: stored, entity });
    } catch (error) {
      return sendError(res, error);
    }
  },

  clear: async (req, res) => {
    try {
      const { descriptor, entity } = await resolveEntity(req.params.category, req.params.id);
      await entity.update({ [descriptor.field]: null });
      return res.status(200).json({ entity });
    } catch (error) {
      return sendError(res, error);
    }
  }
};

module.exports = MediaController;
