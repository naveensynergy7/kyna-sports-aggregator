const express = require('express');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware
router.use(authenticateAdmin);

// Telegram page
router.get('/', (req, res) => {
    res.render('telegram/index', {
        title: 'Telegram Management',
        user: req.user,
        session: req.sessionData,
        currentPage: 'telegram'
    });
});

module.exports = router;
