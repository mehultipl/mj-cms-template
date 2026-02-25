/**
 * MJ-CMS Site Instance
 * Each site has its own CMS instance running on a dedicated port
 * Similar to reference project architecture
 */

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const axios = require('axios');
const { MongoClient } = require('mongodb');

// Load local configuration
const config = require('./config.json');

const app = express();

// Site settings (loaded from admin)
let site = {};
let db = null;

/**
 * Connect to Admin Server and get site configuration
 */
async function connectToAdmin() {
    console.log(`Connecting to Admin Server: ${config.adminUrl}`);

    for (let tries = 0; tries < 5; tries++) {
        try {
            const response = await axios.get(`${config.adminUrl}/api/sites/by-code/${config.siteCode}`, {
                headers: {
                    'Authorization': config.apiKey
                }
            });

            if (response.data && response.data.site) {
                site = response.data.site;
                console.log(`Site loaded: ${site.name}`);
                console.log(`Database: ${site.databaseName}`);
                console.log(`CMS Port: ${site.cmsPort}`);
                return site;
            }
        } catch (err) {
            console.error(`Connection attempt ${tries + 1} failed:`, err.message);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    throw new Error(`Could not connect to admin at ${config.adminUrl}`);
}

/**
 * Connect to MongoDB
 */
async function connectToDatabase() {
    const dbHost = site.databaseHost || 'localhost';
    const dbPort = site.databasePort || 27017;
    const dbName = site.databaseName || `site_${config.siteCode.replace(/-/g, '_')}`;

    const uri = `mongodb://${dbHost}:${dbPort}`;

    console.log(`Connecting to MongoDB: ${uri}/${dbName}`);

    const client = new MongoClient(uri);
    await client.connect();

    db = client.db(dbName);
    console.log(`Connected to database: ${dbName}`);

    return db;
}

/**
 * Setup Express middleware
 */
function setupMiddleware() {
    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

    // Static files
    app.use('/static', express.static(path.join(__dirname, 'public')));
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    // View engine
    app.set('view engine', 'pug');
    app.set('views', path.join(__dirname, 'views'));

    // Make site and db available in all routes
    app.use((req, res, next) => {
        req.site = site;
        req.db = db;
        next();
    });
}

/**
 * Setup routes
 */
function setupRoutes() {
    // Health check
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            site: site.name,
            siteCode: config.siteCode,
            database: site.databaseName,
            port: site.cmsPort
        });
    });

    // Dashboard
    app.get('/', (req, res) => {
        res.render('dashboard', { site });
    });

    // Pages
    app.get('/pages', (req, res) => {
        res.render('pages', { site });
    });
    app.get('/pages/new', (req, res) => {
        res.render('page-form', { site, page: null });
    });
    app.get('/pages/:id', (req, res) => {
        res.render('page-form', { site, pageId: req.params.id });
    });

    // Layouts
    app.get('/layouts', (req, res) => {
        res.render('layouts', { site });
    });
    app.get('/layouts/new', (req, res) => {
        res.render('layout-form', { site, layout: null });
    });
    app.get('/layouts/:id', (req, res) => {
        res.render('layout-form', { site, layoutId: req.params.id });
    });

    // Components
    app.get('/components', (req, res) => {
        res.render('components', { site });
    });
    app.get('/components/new', (req, res) => {
        res.render('component-form', { site, component: null });
    });
    app.get('/components/:id', (req, res) => {
        res.render('component-form', { site, componentId: req.params.id });
    });

    // Media
    app.get('/media', (req, res) => {
        res.render('media', { site });
    });

    // Collections
    app.get('/collections', (req, res) => {
        res.render('collections', { site });
    });

    // Build
    app.get('/build', (req, res) => {
        res.render('build', { site });
    });

    // API Routes
    const apiRouter = require('./routes/api');
    app.use('/api', apiRouter);

    // 404 handler
    app.use((req, res) => {
        res.status(404).render('404', { site });
    });

    // Error handler
    app.use((err, req, res, next) => {
        console.error('Server Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    });
}

/**
 * Start server
 */
async function start() {
    try {
        // 1. Connect to admin and get site config
        await connectToAdmin();

        // 2. Connect to database
        await connectToDatabase();

        // 3. Setup Express
        setupMiddleware();
        setupRoutes();

        // 4. Start listening
        const port = site.cmsPort || config.port || 4001;

        app.listen(port, '0.0.0.0', () => {
            console.log('');
            console.log('='.repeat(50));
            console.log(`MJ-CMS Site Instance: ${site.name}`);
            console.log('='.repeat(50));
            console.log(`Site Code:  ${config.siteCode}`);
            console.log(`CMS URL:    http://localhost:${port}`);
            console.log(`Database:   ${site.databaseName}`);
            console.log('='.repeat(50));
        });

    } catch (error) {
        console.error('Failed to start CMS:', error);
        process.exit(1);
    }
}

// Start the server
start();
