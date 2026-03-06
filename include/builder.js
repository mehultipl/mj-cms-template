/**
 * Site Builder - Generates static HTML from CMS content
 * Supports HTML/Pug for markup and CSS/Stylus for styles
 * Outputs to frontend site folder
 */

const fs = require('fs-extra');
const path = require('path');
const pug = require('pug');

// Try to load stylus (optional dependency)
let stylus;
try {
    stylus = require('stylus');
} catch (e) {
    stylus = null;
    console.log('Stylus not installed - CSS only mode');
}

class SiteBuilder {
    constructor(db, site) {
        this.db = db;
        this.site = site;
        this.siteCode = site.siteCode;
        // Output to XAMPP htdocs sites folder
        this.outputPath = `E:/xampp8.2/htdocs/sites/${this.siteCode}`;
    }

    /**
     * Build the entire site
     */
    async build(options = {}) {
        const startTime = Date.now();
        const log = [];

        try {
            log.push(`Starting build for ${this.site.name}...`);

            // 1. Load all content from database
            log.push('Loading content from database...');
            const pages = await this.db.collection('pages').find({ enabled: true }).toArray();
            const layouts = await this.db.collection('layouts').find({ enabled: true }).toArray();
            const components = await this.db.collection('components').find({ enabled: true }).toArray();

            // Load theme settings if they exist
            const themeDoc = await this.db.collection('settings').findOne({ type: 'theme' });
            this.theme = themeDoc?.data || this.getDefaultTheme();

            log.push(`Found ${pages.length} pages, ${layouts.length} layouts, ${components.length} components`);

            // 2. Ensure output directory exists
            await fs.ensureDir(this.outputPath);
            log.push(`Output directory: ${this.outputPath}`);

            // 2.5 Clean up old page folders that no longer exist
            const cleanupResult = await this.cleanupOldPages(pages);
            if (cleanupResult.removed.length > 0) {
                log.push(`Cleaned up old pages: ${cleanupResult.removed.join(', ')}`);
            }

            // 3. Generate each page
            let generatedCount = 0;
            for (const page of pages) {
                try {
                    await this.generatePage(page, layouts, components);
                    log.push(`Generated: ${page.slug || page.title}`);
                    generatedCount++;
                } catch (err) {
                    log.push(`Error generating ${page.title}: ${err.message}`);
                    console.error(`Error generating ${page.title}:`, err);
                }
            }

            // 4. Generate index.html if no home page
            const hasIndex = pages.some(p => p.slug === '' || p.slug === 'index' || p.slug === '/');
            if (!hasIndex) {
                await this.generateDefaultIndex();
                log.push('Generated default index.html');
            }

            // 5. Copy assets
            await this.copyAssets();
            log.push('Copied assets');

            // 6. Generate sitemap
            await this.generateSitemap(pages);
            log.push('Generated sitemap.xml');

            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            log.push(`\nBuild completed in ${duration} seconds`);
            log.push(`Generated ${generatedCount} pages`);
            log.push(`Output: ${this.outputPath}`);

            return {
                success: true,
                outputPath: this.outputPath,
                filesGenerated: generatedCount,
                duration: duration,
                log: log.join('\n')
            };

        } catch (error) {
            log.push(`\nBuild failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                log: log.join('\n')
            };
        }
    }

    /**
     * Compile markup based on language (html/pug)
     */
    compileMarkup(source, lang, data) {
        if (!source) return '';

        if (lang === 'pug') {
            try {
                return pug.render(source, { ...data, pretty: true });
            } catch (e) {
                console.error('Pug compilation error:', e.message);
                // Return source with error comment
                return `<!-- Pug Error: ${e.message} -->\n${source}`;
            }
        }

        // HTML - just return as is, but process placeholders
        return source;
    }

    /**
     * Compile style based on language (css/stylus)
     */
    compileStyle(source, styleLang, data) {
        if (!source) return '';

        // Replace {{placeholders}} BEFORE Stylus compilation
        if (data) {
            source = this.replacePlaceholders(source, data);
        }

        if (styleLang === 'stylus' && stylus) {
            try {
                let css = '';
                stylus(source).render((err, result) => {
                    if (err) {
                        console.error('Stylus compilation error:', err.message);
                        css = `/* Stylus Error: ${err.message} */\n${source}`;
                    } else {
                        css = result;
                    }
                });
                return css;
            } catch (e) {
                console.error('Stylus compilation error:', e.message);
                return `/* Stylus Error: ${e.message} */\n${source}`;
            }
        }

        // CSS - return as is
        return source;
    }

    /**
     * Get default theme values
     */
    getDefaultTheme() {
        return {
            primaryColor: '#007bff',
            secondaryColor: '#6c757d',
            bodyColor: '#333333',
            blackColor: '#000000',
            whiteColor: '#ffffff',
            hoverColor: '#0056b3',
            headerFont: '"Helvetica Neue", Arial, sans-serif',
            fontTheme: '"Helvetica Neue", Arial, sans-serif'
        };
    }

    /**
     * Generate a single page
     */
    async generatePage(page, layouts, components) {
        // Find layout
        const layout = layouts.find(l => l.id === page.layout) || null;

        // Build page data for templates
        const data = {
            site: this.site,
            // Alias for backward compatibility with templates using 'business'
            business: {
                siteName: this.site.name,
                ...this.site
            },
            theme: this.theme || this.getDefaultTheme(),
            page: {
                title: page.title,
                slug: page.slug,
                body: '', // Will be set after compiling page body
                content: page.body || page.content || '',
                metaTitle: page.metaTitle || page.title,
                metaDescription: page.metaDescription || ''
            }
        };

        // Compile page body/content
        const pageMarkup = page.body || page.content || '';
        const pageLang = page.lang || 'html';
        let pageBody = this.compileMarkup(pageMarkup, pageLang, data);

        // Process components in page body
        pageBody = this.processComponents(pageBody, components, data);

        // Replace placeholders in page body
        pageBody = this.replacePlaceholders(pageBody, data);

        // Update data.page.body with compiled content
        data.page.body = pageBody;

        // Generate final HTML
        let html;
        if (layout && (layout.body || layout.html)) {
            // Use layout template
            const layoutMarkup = layout.body || layout.html || '';
            const layoutLang = layout.lang || 'html';

            // Compile layout
            html = this.compileMarkup(layoutMarkup, layoutLang, data);

            // Replace content placeholders with page body
            html = html.replace(/!\{page\.body\}/gi, pageBody);
            html = html.replace(/!\{content\}/gi, pageBody);
            html = html.replace(/\{\{\s*content\s*\}\}/gi, pageBody);
            html = html.replace(/\{\{\s*page\.body\s*\}\}/gi, pageBody);
            html = html.replace(/\{\{\s*page\.content\s*\}\}/gi, pageBody);
        } else {
            // Use default template with page body
            html = this.getDefaultTemplate(data, pageBody);
        }

        // Replace remaining placeholders
        html = this.replacePlaceholders(html, data);

        // Process any remaining components
        html = this.processComponents(html, components, data);

        // Compile styles
        let combinedStyle = '';

        // Layout style
        if (layout && (layout.style || layout.css)) {
            const layoutStyle = layout.style || layout.css || '';
            const layoutStyleLang = layout.styleLang || 'css';
            combinedStyle += this.compileStyle(layoutStyle, layoutStyleLang, data);
        }

        // Page style
        if (page.style) {
            const pageStyleLang = page.styleLang || 'css';
            const pageStyle = this.compileStyle(page.style, pageStyleLang, data);
            combinedStyle += '\n' + pageStyle;
        }

        // Combine scripts
        let combinedScript = '';
        if (layout && layout.script) {
            combinedScript += layout.script + '\n';
        }
        if (page.script) {
            combinedScript += page.script;
        }

        // Determine output path
        const slug = page.slug || 'index';
        const pageDir = slug === 'index' || slug === ''
            ? this.outputPath
            : path.join(this.outputPath, slug);

        // Ensure directory exists
        await fs.ensureDir(pageDir);

        // Add style and script links to HTML if needed
        if (combinedStyle.trim()) {
            // Write style.css
            await fs.writeFile(path.join(pageDir, 'style.css'), combinedStyle);

            // Add link to head if not already present
            if (!html.includes('style.css')) {
                html = html.replace('</head>', '    <link rel="stylesheet" href="style.css">\n</head>');
            }
        }

        if (combinedScript.trim()) {
            // Write script.js
            await fs.writeFile(path.join(pageDir, 'script.js'), combinedScript);

            // Add script tag if not already present
            if (!html.includes('script.js')) {
                html = html.replace('</body>', '    <script src="script.js"></script>\n</body>');
            }
        }

        // Write index.html
        await fs.writeFile(path.join(pageDir, 'index.html'), html);
    }

    /**
     * Replace {{placeholder}} with data
     */
    replacePlaceholders(html, data) {
        return html.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, key) => {
            const keys = key.trim().split('.');
            let value = data;
            for (const k of keys) {
                if (value && typeof value === 'object') {
                    value = value[k];
                } else {
                    return match;
                }
            }
            return value !== undefined ? value : match;
        });
    }

    /**
     * Process component tags in HTML
     */
    processComponents(html, components, data) {
        for (const component of components) {
            const tagName = component.name.toLowerCase().replace(/\s+/g, '-');
            const regex = new RegExp(`<${tagName}[^>]*>(.*?)<\/${tagName}>|<${tagName}[^>]*\\/>`, 'gi');

            html = html.replace(regex, (match) => {
                // Compile component markup
                const componentMarkup = component.body || component.html || '';
                const componentLang = component.lang || 'html';
                let componentHtml = this.compileMarkup(componentMarkup, componentLang, data);
                componentHtml = this.replacePlaceholders(componentHtml, data);
                return componentHtml;
            });
        }
        return html;
    }

    /**
     * Get default HTML template
     */
    getDefaultTemplate(data, pageBody) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.page.metaTitle || data.page.title} - ${data.site.name}</title>
    <meta name="description" content="${data.page.metaDescription || ''}">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container py-5">
        <h1>${data.page.title}</h1>
        <div class="content">
            ${pageBody || ''}
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
    }

    /**
     * Generate default index page
     */
    async generateDefaultIndex() {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.site.name}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .hero { color: white; text-align: center; padding-top: 20vh; }
    </style>
</head>
<body>
    <div class="container hero">
        <h1>${this.site.name}</h1>
        <p class="lead">Welcome to your website</p>
        <hr style="border-color: rgba(255,255,255,0.3);">
        <p><small>Built with MJ-CMS</small></p>
        <p><a href="https://${this.siteCode}.mj-cms.app" class="btn btn-light">Go to CMS</a></p>
    </div>
</body>
</html>`;

        await fs.writeFile(path.join(this.outputPath, 'index.html'), html);
    }

    /**
     * Copy static assets
     */
    async copyAssets() {
        const assetsSource = path.join(__dirname, '../uploads');
        const assetsDest = path.join(this.outputPath, 'uploads');

        if (await fs.pathExists(assetsSource)) {
            await fs.copy(assetsSource, assetsDest);
        }

        // Also copy any public assets
        const publicSource = path.join(__dirname, '../public');
        const publicDest = path.join(this.outputPath, 'assets');

        if (await fs.pathExists(publicSource)) {
            await fs.copy(publicSource, publicDest);
        }
    }

    /**
     * Generate sitemap.xml
     */
    async generateSitemap(pages) {
        const baseUrl = `https://${this.siteCode}.mj-cms.local`;
        let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // Add home page
        sitemap += `  <url><loc>${baseUrl}/</loc></url>\n`;

        // Add all pages
        for (const page of pages) {
            if (page.slug && page.slug !== 'index') {
                sitemap += `  <url><loc>${baseUrl}/${page.slug}/</loc></url>\n`;
            }
        }

        sitemap += '</urlset>';

        await fs.writeFile(path.join(this.outputPath, 'sitemap.xml'), sitemap);
    }

    /**
     * Clean up old page folders that no longer exist in database
     */
    async cleanupOldPages(pages) {
        const result = { removed: [], kept: [] };

        // Protected folders that should never be deleted
        const protectedFolders = new Set(['uploads', 'assets', 'css', 'js', 'images', 'fonts', 'media']);

        // Get all valid page slugs (non-empty slugs that create folders)
        const validSlugs = new Set(
            pages
                .map(p => p.slug)
                .filter(slug => slug && slug !== '' && slug !== 'index' && slug !== '/')
        );

        try {
            // Read all items in output directory
            const items = await fs.readdir(this.outputPath);

            for (const item of items) {
                const itemPath = path.join(this.outputPath, item);
                const stat = await fs.stat(itemPath);

                // Only check directories (not files like index.html, sitemap.xml)
                if (stat.isDirectory()) {
                    // Skip protected folders
                    if (protectedFolders.has(item.toLowerCase())) {
                        result.kept.push(item);
                        continue;
                    }

                    // If folder matches a current page slug, keep it
                    if (validSlugs.has(item)) {
                        result.kept.push(item);
                    } else {
                        // Remove orphaned folder
                        await fs.remove(itemPath);
                        result.removed.push(item);
                        console.log(`Removed old page folder: ${item}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error cleaning up old pages:', error.message);
        }

        return result;
    }
}

module.exports = SiteBuilder;
