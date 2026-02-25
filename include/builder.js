/**
 * Site Builder - Generates static HTML from CMS content
 * Outputs to frontend site folder
 */

const fs = require('fs-extra');
const path = require('path');
const pug = require('pug');

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

            log.push(`Found ${pages.length} pages, ${layouts.length} layouts, ${components.length} components`);

            // 2. Ensure output directory exists
            await fs.ensureDir(this.outputPath);
            log.push(`Output directory: ${this.outputPath}`);

            // 3. Generate each page
            let generatedCount = 0;
            for (const page of pages) {
                try {
                    await this.generatePage(page, layouts, components);
                    log.push(`Generated: ${page.slug || page.title}`);
                    generatedCount++;
                } catch (err) {
                    log.push(`Error generating ${page.title}: ${err.message}`);
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
     * Generate a single page
     */
    async generatePage(page, layouts, components) {
        // Find layout
        const layout = layouts.find(l => l.id === page.layout) || null;

        // Build page data
        const data = {
            site: this.site,
            page: {
                title: page.title,
                slug: page.slug,
                content: page.content || '',
                metaTitle: page.metaTitle || page.title,
                metaDescription: page.metaDescription || ''
            }
        };

        // Generate HTML
        let html;
        if (layout && layout.html) {
            // Use layout template
            html = this.renderTemplate(layout.html, data);
            // Replace {{content}} placeholder with page content
            html = html.replace(/\{\{\s*content\s*\}\}/gi, page.content || '');
            html = html.replace(/\{\{\s*page\.content\s*\}\}/gi, page.content || '');
        } else {
            // Use default template
            html = this.getDefaultTemplate(data);
        }

        // Replace data placeholders
        html = this.replacePlaceholders(html, data);

        // Process components
        html = this.processComponents(html, components, data);

        // Determine output path
        const slug = page.slug || 'index';
        const outputFile = slug === 'index' || slug === ''
            ? path.join(this.outputPath, 'index.html')
            : path.join(this.outputPath, slug, 'index.html');

        // Ensure directory exists
        await fs.ensureDir(path.dirname(outputFile));

        // Write file
        await fs.writeFile(outputFile, html);
    }

    /**
     * Render a template with Pug or plain HTML
     */
    renderTemplate(template, data) {
        // Check if it's Pug
        if (template.includes('doctype') || template.match(/^\s*\w+\(/m)) {
            try {
                return pug.render(template, data);
            } catch (e) {
                // Fallback to plain HTML
                return template;
            }
        }
        return template;
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
                let componentHtml = component.html || '';
                componentHtml = this.replacePlaceholders(componentHtml, data);
                return componentHtml;
            });
        }
        return html;
    }

    /**
     * Get default HTML template
     */
    getDefaultTemplate(data) {
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
            ${data.page.content || ''}
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
}

module.exports = SiteBuilder;
