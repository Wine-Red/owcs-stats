const MATCH_DATA_READ_ONLY_RESPONSE = {
  code: 'MATCH_DATA_READ_ONLY',
  message: '比赛数据由 Matchweb 管理，请在 Matchweb 修改后重新同步'
};

const matchDataReadOnly = (req, res) => res.status(405).json(MATCH_DATA_READ_ONLY_RESPONSE);

module.exports = { MATCH_DATA_READ_ONLY_RESPONSE, matchDataReadOnly };
