const router = require('express').Router();
const controller = require('../controllers/ppController');

router.get('/leaderboard', controller.getLeaderboard);
router.get('/beatmaps/:beatmap_id/leaderboard', controller.getBeatmapLeaderboard);

module.exports = router;
