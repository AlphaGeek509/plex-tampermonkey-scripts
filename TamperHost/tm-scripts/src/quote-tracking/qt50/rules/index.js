// src/quote-tracking/validation/rules/index.js
import autoManageLtPartNoOnQuote from './autoManageLtPartNoOnQuote';
//import forbidZeroPrice from './forbidZeroPrice';
import minUnitPrice from './minUnitPrice';
import maxUnitPrice from './maxUnitPrice';

export default [autoManageLtPartNoOnQuote, maxUnitPrice, minUnitPrice];  //requireResolvedPart, forbidZeroPrice, 
