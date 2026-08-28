import baseData from './mock-data';
import { SUPPLIER_DATA } from './suppliers-data';
import { COST_EXTRA } from './cost-data';

const MOCK_DATA = {
  ...baseData,
  ...SUPPLIER_DATA,
  ...COST_EXTRA,
} as typeof baseData & typeof SUPPLIER_DATA & typeof COST_EXTRA;

export default MOCK_DATA;
