import { isDisplayPackage } from '../services/packageMode.mjs';
import { embeddedPackage } from '../services/embeddedPackage.mjs';

export const packageAssetUrl = path => {
  const relative = path.replace(/^(?:\.\/|\/)/, '');
  return isDisplayPackage ? embeddedPackage().asset(relative) : `${import.meta.env.BASE_URL}${relative}`;
};
