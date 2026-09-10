export const isSnapshotPackage = import.meta.env.MODE === 'static';
export const isApiPackage = import.meta.env.MODE === 'api-static';
export const isDisplayPackage = isSnapshotPackage || isApiPackage;
