const REMOTE_TBD_TEAM_LOGO = 'https://owmini.xyz/images/tbd.png';

export const TBD_TEAM_LOGO_URL = import.meta.env.MODE === 'static'
  ? `${import.meta.env.BASE_URL}static-data/team-logos/team-tbd.png`
  : REMOTE_TBD_TEAM_LOGO;
