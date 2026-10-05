const Player = require('../models/Player');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const { getPlayerContext } = require('../services/AdminEntityContextService');
const { identityTransaction } = require('../services/IdentityWriteService');
const { PlayerAlias, PlayerExternalIdentity, EntityRedirect } = require('../models/EntityIdentity');
const { serializePlayersWithAliases, validatePlayerIdentity, replacePlayerAliases, protectedAliases, resolveCanonicalId } = require('../services/PlayerIdentityService');

const playerPayload = body => ({ name: body?.name, role: body?.role });

const PlayerController = {
  // 获取所有选手
  getAll: async (req, res) => {
    try {
      const players = await Player.findAll();
      res.status(200).json(await serializePlayersWithAliases(players));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个选手
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const player = await Player.findByPk(await resolveCanonicalId('player', id));
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.status(200).json(await serializePlayersWithAliases(player));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getAdminContext: async (req, res) => {
    try {
      const context = await getPlayerContext(await resolveCanonicalId('player', req.params.id));
      if (!context) return res.status(404).json({ error: 'Player not found' });
      context.identity = await require('../services/PlayerIdentityService').getIdentityMaintenance('player', context.entity.id);
      res.status(200).json(context);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建选手
  create: async (req, res) => {
    try {
      const player = await identityTransaction(async transaction => {
        const identity = await validatePlayerIdentity({ name: req.body?.name, role: req.body?.role, aliases: req.body?.aliases || [], transaction });
        const row = await Player.create({ ...playerPayload(req.body), name: identity.name, identityOrigin: 'manual' }, { transaction });
        await replacePlayerAliases(row.id, identity.aliases, transaction);
        return serializePlayersWithAliases(row, transaction);
      });
      res.status(201).json(player);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新选手
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await identityTransaction(async transaction => {
        const player = await Player.findByPk(id, { transaction });
        if (!player) return null;
        const current = await serializePlayersWithAliases(player, transaction);
        const requested = Object.prototype.hasOwnProperty.call(req.body || {}, 'aliases') ? req.body.aliases : current.aliases;
        if (!Array.isArray(requested)) throw new Error('选手别名必须是数组');
        const identity = await validatePlayerIdentity({ playerId: player.id, name: req.body?.name || player.name, role: req.body?.role || player.role,
          aliases: [...requested, ...await protectedAliases('player', player.id, transaction),
            ...(req.body?.name && req.body.name !== player.name ? [player.name] : [])], transaction });
        await player.update({ ...playerPayload(req.body), name: identity.name }, { transaction });
        await replacePlayerAliases(player.id, identity.aliases, transaction);
        return serializePlayersWithAliases(player, transaction);
      });
      if (!result) return res.status(404).json({ error: 'Player not found' });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除选手
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await identityTransaction(async transaction => {
      const player = await Player.findByPk(id, { transaction });
      if (!player) return { status: 404, body: { error: 'Player not found' } };
      const [playerStatsCount, membershipsCount] = await Promise.all([
        PlayerStat.count({ where: { playerId: id }, transaction }),
        SeasonTeamPlayer.count({ where: { playerId: id }, transaction })
      ]);
      if (playerStatsCount || membershipsCount) {
        return { status: 409, body: {
          code: 'DATA_IN_USE',
          message: '该选手仍被比赛或赛季阵容引用，不能直接删除。',
          references: { playerStatsCount, membershipsCount }
        } };
      }
      if (await EntityRedirect.count({ where: { kind: 'player', targetId: id }, transaction })) {
        return { status: 409, body: { error: '该选手承接了合并身份，不能直接删除；可继续合并到其他选手' } };
      }
      await PlayerAlias.destroy({ where: { playerId: id }, transaction });
      await PlayerExternalIdentity.destroy({ where: { playerId: id }, transaction });
      await player.destroy({ transaction });
      return { status: 200, body: { message: 'Player deleted successfully' } };
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = PlayerController;
