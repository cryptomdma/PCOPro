export type ProductType =
  | 'DUST'
  | 'GRANULE'
  | 'CONCENTRATE'
  | 'AEROSOL'
  | 'ANT_BAIT'
  | 'ROACH_BAIT'
  | 'RODENT_BAIT'
  | 'SANITATION'
  | 'OTHER';

export function formatProductType(type?: string | null) {
  if (!type) return 'Unspecified';
  switch (type) {
    case 'DUST':
      return 'Dust';
    case 'GRANULE':
      return 'Granule';
    case 'CONCENTRATE':
      return 'Concentrate';
    case 'AEROSOL':
      return 'Aerosol';
    case 'ANT_BAIT':
      return 'Ant bait';
    case 'ROACH_BAIT':
      return 'Roach bait';
    case 'RODENT_BAIT':
      return 'Rodent bait';
    case 'SANITATION':
      return 'Sanitation';
    case 'OTHER':
    default:
      return 'Other';
  }
}
