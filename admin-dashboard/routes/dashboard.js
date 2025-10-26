const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// Redirect root to matches
router.get('/', (req, res) => {
    res.redirect('/dashboard/matches');
});

// Matches page - show all football matches with pagination and filters
router.get('/matches', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        // Get filter parameters
        const filters = {
            date: req.query.date || '',
            time: req.query.time || '',
            gameType: req.query.gameType || '',
            status: req.query.status || ''
        };

        // Build WHERE clause based on filters
        let whereConditions = [];
        let queryParams = [];

        if (filters.date) {
            whereConditions.push('date = ?');
            queryParams.push(filters.date);
        }

        if (filters.time) {
            whereConditions.push('time = ?');
            queryParams.push(filters.time);
        }

        if (filters.gameType) {
            whereConditions.push('game_type = ?');
            queryParams.push(filters.gameType);
        }

        if (filters.status) {
            whereConditions.push('status = ?');
            queryParams.push(filters.status);
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ') 
            : '';

        // Get total count of matches with filters
        const countQuery = `SELECT COUNT(*) as total FROM football_matches ${whereClause}`;
        const [countResult] = queryParams.length > 0 
            ? await pool.execute(countQuery, queryParams)
            : await pool.execute(countQuery);
        
        const totalMatches = countResult[0].total;
        const totalPages = Math.ceil(totalMatches / limit);

        // Get paginated matches with filters
        const matchesQuery = `
            SELECT 
                id,
                platform,
                entry,
                location,
                date,
                time,
                game_type,
                requirement,
                match_duration,
                match_pace,
                status
            FROM football_matches 
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [matches] = queryParams.length > 0 
            ? await pool.execute(matchesQuery, queryParams)
            : await pool.query(matchesQuery);

        // Get unique values for filter dropdowns
        const [dates] = await pool.query(
            'SELECT DISTINCT date FROM football_matches WHERE date IS NOT NULL ORDER BY date DESC'
        );
        const [times] = await pool.query(
            'SELECT DISTINCT time FROM football_matches WHERE time IS NOT NULL ORDER BY time'
        );
        const [gameTypes] = await pool.query(
            'SELECT DISTINCT game_type FROM football_matches WHERE game_type IS NOT NULL ORDER BY game_type'
        );

        // Format dates to YYYY-MM-DD string
        const formattedDates = dates.map(d => {
            const date = new Date(d.date);
            return date.toISOString().split('T')[0];
        });

        // Build filter query string for pagination
        const filterQueryParams = [];
        if (filters.date) filterQueryParams.push(`date=${encodeURIComponent(filters.date)}`);
        if (filters.time) filterQueryParams.push(`time=${encodeURIComponent(filters.time)}`);
        if (filters.gameType) filterQueryParams.push(`gameType=${encodeURIComponent(filters.gameType)}`);
        if (filters.status) filterQueryParams.push(`status=${encodeURIComponent(filters.status)}`);
        const filterQuery = filterQueryParams.length > 0 ? '&' + filterQueryParams.join('&') : '';

        res.render('dashboard/matches', {
            title: 'Football Matches',
            matches: matches,
            currentPage: page,
            totalPages: totalPages,
            totalMatches: totalMatches,
            filters: filters,
            filterQuery: filterQuery,
            availableDates: formattedDates,
            availableTimes: times.map(t => t.time),
            availableGameTypes: gameTypes.map(g => g.game_type)
        });
    } catch (error) {
        console.error('Matches error:', error);
        res.render('error', {
            title: 'Error',
            message: 'Failed to load matches'
        });
    }
});

// Single match detail view
router.get('/matches/:id', async (req, res) => {
    try {
        const matchId = req.params.id;
        
        // Get single match details
        const [matches] = await pool.execute(`
            SELECT 
                id,
                original_message,
                platform,
                entry,
                location,
                date,
                time,
                game_type,
                requirement,
                other_details,
                contact_url,
                match_duration,
                match_pace,
                status,
                confidence,
                created_at,
                updated_at
            FROM football_matches 
            WHERE id = ?
        `, [matchId]);

        if (matches.length === 0) {
            return res.render('error', {
                title: 'Not Found',
                message: 'Match not found'
            });
        }

        res.render('dashboard/match-detail', {
            title: 'Match Details',
            match: matches[0]
        });
    } catch (error) {
        console.error('Match detail error:', error);
        res.render('error', {
            title: 'Error',
            message: 'Failed to load match details'
        });
    }
});

// Update match status
router.post('/matches/:id/status', async (req, res) => {
    try {
        const matchId = req.params.id;
        const { status } = req.body;

        // Validate status
        if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        await pool.execute(
            'UPDATE football_matches SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, matchId]
        );

        res.redirect(`/dashboard/matches/${matchId}`);
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Delete match
router.post('/matches/:id/delete', async (req, res) => {
    try {
        const matchId = req.params.id;

        await pool.execute(
            'DELETE FROM football_matches WHERE id = ?',
            [matchId]
        );

        res.redirect('/dashboard/matches');
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete match' });
    }
});

module.exports = router;
