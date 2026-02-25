/**
 * API Routes for Site CMS Instance
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Helper to get collection
function collection(req, name) {
    return req.db.collection(name);
}

// ==================== PAGES ====================

// Get all pages
router.get('/pages', async (req, res) => {
    try {
        const pages = await collection(req, 'pages')
            .find({ enabled: true })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(pages);
    } catch (error) {
        console.error('Error fetching pages:', error);
        res.status(500).json({ error: 'Failed to fetch pages' });
    }
});

// Get single page
router.get('/pages/:id', async (req, res) => {
    try {
        const page = await collection(req, 'pages').findOne({ id: req.params.id });
        if (!page) return res.status(404).json({ error: 'Page not found' });
        res.json(page);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch page' });
    }
});

// Create page
router.post('/pages', async (req, res) => {
    try {
        const page = {
            id: uuidv4(),
            ...req.body,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await collection(req, 'pages').insertOne(page);
        res.json({ success: true, page });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create page' });
    }
});

// Update page
router.put('/pages/:id', async (req, res) => {
    try {
        const result = await collection(req, 'pages').findOneAndUpdate(
            { id: req.params.id },
            { $set: { ...req.body, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!result) return res.status(404).json({ error: 'Page not found' });
        res.json({ success: true, page: result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update page' });
    }
});

// Delete page
router.delete('/pages/:id', async (req, res) => {
    try {
        await collection(req, 'pages').deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete page' });
    }
});

// ==================== LAYOUTS ====================

router.get('/layouts', async (req, res) => {
    try {
        const layouts = await collection(req, 'layouts')
            .find({ enabled: true })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(layouts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch layouts' });
    }
});

router.get('/layouts/:id', async (req, res) => {
    try {
        const layout = await collection(req, 'layouts').findOne({ id: req.params.id });
        if (!layout) return res.status(404).json({ error: 'Layout not found' });
        res.json(layout);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch layout' });
    }
});

router.post('/layouts', async (req, res) => {
    try {
        const layout = {
            id: uuidv4(),
            ...req.body,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await collection(req, 'layouts').insertOne(layout);
        res.json({ success: true, layout });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create layout' });
    }
});

router.put('/layouts/:id', async (req, res) => {
    try {
        const result = await collection(req, 'layouts').findOneAndUpdate(
            { id: req.params.id },
            { $set: { ...req.body, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!result) return res.status(404).json({ error: 'Layout not found' });
        res.json({ success: true, layout: result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update layout' });
    }
});

router.delete('/layouts/:id', async (req, res) => {
    try {
        await collection(req, 'layouts').deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete layout' });
    }
});

// ==================== COMPONENTS ====================

router.get('/components', async (req, res) => {
    try {
        const components = await collection(req, 'components')
            .find({ enabled: true })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(components);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch components' });
    }
});

router.get('/components/:id', async (req, res) => {
    try {
        const component = await collection(req, 'components').findOne({ id: req.params.id });
        if (!component) return res.status(404).json({ error: 'Component not found' });
        res.json(component);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch component' });
    }
});

router.post('/components', async (req, res) => {
    try {
        const component = {
            id: uuidv4(),
            ...req.body,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await collection(req, 'components').insertOne(component);
        res.json({ success: true, component });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create component' });
    }
});

router.put('/components/:id', async (req, res) => {
    try {
        const result = await collection(req, 'components').findOneAndUpdate(
            { id: req.params.id },
            { $set: { ...req.body, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!result) return res.status(404).json({ error: 'Component not found' });
        res.json({ success: true, component: result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update component' });
    }
});

router.delete('/components/:id', async (req, res) => {
    try {
        await collection(req, 'components').deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete component' });
    }
});

// ==================== COLLECTIONS ====================

router.get('/collections', async (req, res) => {
    try {
        const collections = await collection(req, 'collections')
            .find({ enabled: true })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(collections);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch collections' });
    }
});

// ==================== BUILD ====================

router.post('/build', async (req, res) => {
    try {
        const SiteBuilder = require('../include/builder');
        const builder = new SiteBuilder(req.db, req.site);

        console.log('Starting build...');
        const result = await builder.build(req.body || {});

        console.log('Build result:', result.success ? 'Success' : 'Failed');
        res.json(result);
    } catch (error) {
        console.error('Build error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get build status/result
router.get('/build/status', async (req, res) => {
    try {
        const result = await collection(req, 'buildResult').findOne({}, { sort: { startedAt: -1 } });
        res.json({ result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get build status' });
    }
});

module.exports = router;
