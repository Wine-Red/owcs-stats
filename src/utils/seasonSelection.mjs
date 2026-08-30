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
