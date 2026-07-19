const express = require('express');
const maniaAnalyserRoutes = require('./tools/maniaAnalyserRoute');
const aiImageModule = require('../modules/aiImage');

const router = express.Router();

router.use('/mania', maniaAnalyserRoutes);
router.use('/aimg', aiImageModule.router);

module.exports = router;
