# MJ-CMS Site Template

This is the CMS template for MJ-CMS sites. Each site gets its own instance of this CMS.

## Setup

1. Clone this repository
2. Copy `config.json.example` to `config.json`
3. Update `config.json` with your site details
4. Run `npm install`
5. Start with `npm start` or use PM2

## Configuration

```json
{
    "siteCode": "your-site-code",
    "siteName": "Your Site Name",
    "adminUrl": "http://localhost:3000",
    "apiKey": "your-api-key",
    "port": 4001
}
```

## Features

- Pages management
- Layouts management
- Components management
- Media library
- Collections
- Site builder (generates static HTML)

## Architecture

- Connects to Admin server to get site configuration
- Uses site-specific MongoDB database
- Runs on dedicated port per site
- Builds static HTML to XAMPP htdocs

## License

MIT
