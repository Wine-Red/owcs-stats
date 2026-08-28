import { resolveMediaUrl } from './media';

// DB 英雄名 → public/heroes/illustrated/ 文件 slug（仅作为未配置图片时的兼容回退）
export const HERO_SLUG_BY_NAME = {
  '毛加': 'mauga', '奥丽莎': 'orisa', '路霸': 'roadhog', '查莉娅': 'zarya',
  'D.Va': 'dva', '末日铁拳': 'doomfist', '温斯顿': 'winston', '破坏球': 'wrecking-ball',
  '金驭': 'domina', '骇灾': 'hazard', '渣客女王': 'junker-queen', '拉玛刹': 'ramattra',
  '莱因哈特': 'reinhardt', '西格玛': 'sigma',
  '艾什': 'ashe', '卡西迪': 'cassidy', '半藏': 'hanzo', '索杰恩': 'sojourn',
  '黑百合': 'widowmaker', '安燃': 'anran', '源氏': 'genji', '死神': 'reaper',
  '猎空': 'tracer', '斩仇': 'shion', '探奇': 'venture', '堡垒': 'bastion',
  '埃姆雷': 'emre', '狂鼠': 'junkrat', '美': 'mei', '士兵：76': 'soldier-76',
  '秩序之光': 'symmetra', '托比昂': 'torbjorn', '回声': 'echo', '弗雷娅': 'freja',
  '法老之鹰': 'pharah', '黑影': 'sombra', '死怨': 'vendetta', '西拉': 'sierra',
  '安娜': 'ana', '巴蒂斯特': 'baptiste', '飞天猫': 'jetpack-cat', '卢西奥': 'lucio',
  '禅雅塔': 'zenyatta', '雾子': 'kiriko', '生命之梭': 'lifeweaver', '天使': 'mercy',
  '莫伊拉': 'moira', '布里吉塔': 'brigitte', '伊拉锐': 'illari', '朱诺': 'juno',
  '瑞稀': 'mizuki', '无漾': 'wuyang'
};

export const getHeroIconUrl = (heroOrName, heroRecords = []) => {
  const hero = typeof heroOrName === 'object' && heroOrName
    ? heroOrName
    : heroRecords.find(item => item?.name === heroOrName);
  if (hero?.image) return resolveMediaUrl(hero.image);

  const heroName = hero?.name || heroOrName;
  if (!heroName) return '';
  const slug = HERO_SLUG_BY_NAME[heroName];
  if (!slug) return '';
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${baseUrl}heroes/illustrated/${slug}.png`;
};
