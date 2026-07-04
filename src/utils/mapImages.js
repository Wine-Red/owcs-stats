export const typeFolderMap = {
  '占领要点': 'control',
  '运载目标': 'escort',
  '攻击/护送': 'hybrid',
  '机动推进': 'push',
  '闪点作战': 'flashpoint'
};

export const fileMap = {
  '南极半岛': 'Antarctic_Peninsula.jpg',
  '釜山': 'Busan.jpg',
  '伊利奥斯': 'Ilios.jpg',
  '漓江塔': 'Lijiang-tower.jpg',
  '尼泊尔': 'Nepal.jpg',
  '绿洲城': 'Oasis.jpg',
  '萨摩亚': 'Samoa.jpg',
  '香巴里寺院': '1067px-Shambali.jpg',
  '多拉多': 'Dorado.jpg',
  '哈瓦那': 'Havana.jpg',
  '渣客镇': 'Junkertown.jpg',
  '皇家赛道': 'Monte_Carlo.jpg', 
  '里阿尔托': 'Rialto.jpg',
  '66号公路': 'Route-66.jpg',
  '监测站：直布罗陀': 'Watchpoint-gibraltar.jpg',
  '暴雪世界': 'Blizzard-world.jpg',
  '艾兴瓦尔德': 'Eichenwalde.jpg',
  '好莱坞': 'Hollywood.jpg',
  '国王大道': 'Kings-row.jpg',
  '中城': 'Midtown.jpg',
  '努巴尼': 'Numbani.jpg',
  '帕拉伊索': 'Paraiso.jpg',
  '帕拉伊苏': 'Paraiso.jpg',
  '斗兽场': 'Colosseo.jpg',
  '埃斯佩兰萨': 'Esperanca.jpg',
  '新皇后街': 'NewQueenStreet.jpg',
  '卢纳萨皮': 'Runasapi.jpg',
  '鲁纳塞彼': 'Runasapi.jpg',
  '新渣客城': 'New_Junk_City.jpg',
  '苏拉瓦萨': 'Suravasa.jpg',
  '阿特利斯': 'Aatlis.jpg',
  '霓虹枢纽': 'Neon_Junction.jpg',
  
  // English fallbacks just in case
  'Antarctic Peninsula': 'Antarctic_Peninsula.jpg',
  'Busan': 'Busan.jpg',
  'Ilios': 'Ilios.jpg',
  'Lijiang Tower': 'Lijiang-tower.jpg',
  'Nepal': 'Nepal.jpg',
  'Oasis': 'Oasis.jpg',
  'Samoa': 'Samoa.jpg',
  'Shambali Monastery': '1067px-Shambali.jpg',
  'Dorado': 'Dorado.jpg',
  'Havana': 'Havana.jpg',
  'Junkertown': 'Junkertown.jpg',
  'Circuit royal': 'Monte_Carlo.jpg',
  'Rialto': 'Rialto.jpg',
  'Route 66': 'Route-66.jpg',
  'Watchpoint: Gibraltar': 'Watchpoint-gibraltar.jpg',
  'Blizzard World': 'Blizzard-world.jpg',
  'Eichenwalde': 'Eichenwalde.jpg',
  'Hollywood': 'Hollywood.jpg',
  'King\'s Row': 'Kings-row.jpg',
  'Midtown': 'Midtown.jpg',
  'Numbani': 'Numbani.jpg',
  'Paraíso': 'Paraiso.jpg',
  'Colosseo': 'Colosseo.jpg',
  'Esperança': 'Esperanca.jpg',
  'New Queen Street': 'NewQueenStreet.jpg',
  'Runasapi': 'Runasapi.jpg',
  'New Junk City': 'New_Junk_City.jpg',
  'Suravasa': 'Suravasa.jpg',
  'Aatlis': 'Aatlis.jpg',
  'Neon Junction': 'Neon_Junction.jpg'
};

export const getMapImageUrl = (map) => {
  if (!map) return '';
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  
  const folder = typeFolderMap[map.type] || 'hybrid';
  let filename = fileMap[map.name];
  if (!filename) {
    filename = `${map.name.replace(/ /g, '-')}.jpg`;
  }
  
  return `${baseUrl}maps/${folder}/${filename}`;
};

export const getMapModeKey = (mapType) => {
  const type = String(mapType || '').trim();
  return typeFolderMap[type] || '';
};

export const getMapModeLabel = (mapType) => {
  return String(mapType || '').trim() || '未知模式';
};

export const getMapModeIconUrl = (mapOrType) => {
  const type = typeof mapOrType === 'string' ? mapOrType : mapOrType?.type;
  const key = getMapModeKey(type);
  if (!key) return '';

  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  return `${baseUrl}maps/logo/${key}.png`;
};
