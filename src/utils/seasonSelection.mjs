const getNumericSeasonId = season => {
  const id = Number(season?.id)
  return Number.isFinite(id) ? id : Number.NEGATIVE_INFINITY
}

export const sortSeasonsNewestFirst = (seasonList = []) => {
  return [...seasonList].sort((left, right) => {
    const idDifference = getNumericSeasonId(right) - getNumericSeasonId(left)
    if (idDifference !== 0) return idDifference

    return String(right?.id ?? '').localeCompare(String(left?.id ?? ''), 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

export const sortSeasonsForDisplay = (seasonList = [], configuredIds = []) => {
  const rank = new Map()
  for (const value of Array.isArray(configuredIds) ? configuredIds : []) {
    const id = Number(value)
    if (Number.isInteger(id) && id > 0 && !rank.has(id)) rank.set(id, rank.size)
  }
  return sortSeasonsNewestFirst(seasonList).sort((left, right) => {
    const leftRank = rank.get(Number(left.id)) ?? Number.MAX_SAFE_INTEGER
    const rightRank = rank.get(Number(right.id)) ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank
  })
}

export const sortSeasonGroupsNewestFirst = (groups = []) => {
  const newestSeasonId = group => Math.max(
    Number.NEGATIVE_INFINITY,
    ...(group?.options || []).map(getNumericSeasonId)
  )

  return [...groups].sort((left, right) => {
    const idDifference = newestSeasonId(right) - newestSeasonId(left)
    if (idDifference !== 0) return idDifference

    return String(right?.label ?? '').localeCompare(String(left?.label ?? ''), 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

export const getDefaultSeason = (seasonList = []) => {
  const newestFirst = sortSeasonsNewestFirst(seasonList)
  return newestFirst.find(season => season?.status === 'in_progress') || newestFirst[0] || null
}
