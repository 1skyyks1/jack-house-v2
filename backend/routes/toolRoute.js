const express = require('express');
const maniaAnalyserRoutes = require('./tools/maniaAnalyserRoute');

const router = express.Router();

router.use('/mania', maniaAnalyserRoutes);

module.exports = router;
