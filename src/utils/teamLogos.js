import { packageAssetUrl } from './packageAssets';
const REMOTE_TBD_TEAM_LOGO = 'https://owmini.xyz/images/tbd.png';

export const TBD_TEAM_LOGO_URL = import.meta.env.MODE === 'static'
  ? packageAssetUrl('static-data/team-logos/team-tbd.png')
  : import.meta.env.MODE === 'api-static' ? packageAssetUrl('branding/team-tbd.png') : REMOTE_TBD_TEAM_LOGO;
