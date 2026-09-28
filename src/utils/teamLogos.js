import { packageAssetUrl } from './packageAssets';
const REMOTE_TBD_TEAM_LOGO = 'https://owmini.xyz/images/tbd.png';

export const TBD_TEAM_LOGO_URL = ['static', 'api-static'].includes(import.meta.env.MODE)
  ? packageAssetUrl('branding/team-tbd.png') : REMOTE_TBD_TEAM_LOGO;
