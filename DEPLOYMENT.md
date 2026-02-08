# Frontend Deployment Guide

This guide explains how to deploy the Quai Vault frontend and fix SPA routing issues.

## The Problem

Single Page Applications (SPAs) use client-side routing. When users navigate directly to routes like `/wallet/0x...` or refresh the page, the server returns a 404 because it's looking for that file path instead of serving the React app.

## The Solution

Configure your web server to serve `index.html` for all routes (except static assets). The React Router will then handle the routing on the client side.

---

## Configuration by Platform

### 1. Nginx (Recommended for Custom Servers)

**File:** `nginx.conf` (root level)

**Setup:**
1. Copy the `nginx.conf` to your server configuration directory (usually `/etc/nginx/sites-available/`)
2. Create a symbolic link: `sudo ln -s /etc/nginx/sites-available/quai-vault /etc/nginx/sites-enabled/`
3. Update the `root` path to point to your built frontend: `/var/www/quai-vault/dist`
4. Test configuration: `sudo nginx -t`
5. Reload nginx: `sudo systemctl reload nginx`

**For SSL/HTTPS:**
- Uncomment the SSL configuration section in `nginx.conf`
- Use Let's Encrypt: `sudo certbot --nginx -d testnet.quaivault.org -d app.quaivault.org`

---

### 2. Apache

**File:** `public/.htaccess`

The `.htaccess` file is already configured and will be copied to the `dist` folder during build. Make sure:
1. `mod_rewrite` is enabled: `sudo a2enmod rewrite`
2. Apache is configured to allow `.htaccess` overrides in your virtual host:
   ```apache
   <Directory /var/www/quai-vault/dist>
       AllowOverride All
   </Directory>
   ```
3. Restart Apache: `sudo systemctl restart apache2`

---

### 3. Netlify

**File:** `public/_redirects`

The `_redirects` file is already configured. When you deploy to Netlify:
1. Build command: `npm run build`
2. Publish directory: `dist`
3. Netlify will automatically use the `_redirects` file

---

### 4. Vercel

**File:** `vercel.json` (root level)

The `vercel.json` is already configured. When you deploy to Vercel:
1. Import your GitHub repository
2. Framework preset: Vite
3. Build command: `npm run build`
4. Output directory: `dist`
5. Vercel will automatically use the `vercel.json` configuration

---

### 5. Static Hosting (AWS S3, Cloudflare Pages, etc.)

For static hosting platforms:

1. **Cloudflare Pages:** Use the `_redirects` file (same as Netlify)
2. **AWS S3 + CloudFront:**
   - Configure CloudFront error pages to serve `index.html` for 404 errors
   - Error code: 404, Response: `/index.html`, Status: 200
3. **GitHub Pages:** Not recommended for SPAs with dynamic routes

---

## Build and Deploy

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env`
   - Update `VITE_SITE_URL` based on your deployment:
     - Testnet: `https://testnet.quaivault.org`
     - Mainnet: `https://app.quaivault.org`
   - Update `VITE_NETWORK_SCHEMA` to match (testnet or mainnet)

3. **Build:**
   ```bash
   npm run build
   ```

4. **Test locally:**
   ```bash
   npm run preview
   ```
   Navigate to routes like `http://localhost:4173/wallet/0x...` to verify routing works

5. **Deploy:**
   - Upload the `dist` folder to your web server
   - Ensure the correct configuration file is in place for your platform

---

## Verification

After deployment, test these URLs:
- ✓ Root: `https://testnet.quaivault.org/`
- ✓ Create: `https://testnet.quaivault.org/create`
- ✓ Wallet: `https://testnet.quaivault.org/wallet/0x...`
- ✓ Refresh any route (should not 404)

---

## Troubleshooting

**Still getting 404s?**

1. **Nginx:** Check error logs: `sudo tail -f /var/log/nginx/error.log`
2. **Apache:** Ensure `AllowOverride All` is set
3. **Vercel/Netlify:** Check build logs for errors
4. **Cache issues:** Clear browser cache and CDN cache

**Routes work but CSS/JS are broken?**

- Check that `base` in `vite.config.ts` is set correctly (default is `/`)
- Verify static assets are being served from the correct path

**Environment variables not working?**

- Vite environment variables must start with `VITE_`
- Rebuild after changing `.env` file
- Check the built HTML file to verify variables were replaced

---

## Security Headers

All configuration files include recommended security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`

For production, also consider adding:
- Content Security Policy (CSP)
- Strict-Transport-Security (HSTS) for HTTPS

---

## Environment-Specific Deployments

### Testnet
```bash
# .env
VITE_SITE_URL=https://testnet.quaivault.org
VITE_NETWORK_SCHEMA=testnet
VITE_RPC_URL=https://rpc.orchard.quai.network
VITE_CHAIN_ID=9000
```

### Mainnet
```bash
# .env
VITE_SITE_URL=https://app.quaivault.org
VITE_NETWORK_SCHEMA=mainnet
VITE_RPC_URL=https://rpc.quai.network
VITE_CHAIN_ID=1
```

---

## Continuous Deployment

Example GitHub Actions workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_SITE_URL: ${{ secrets.VITE_SITE_URL }}
          VITE_NETWORK_SCHEMA: ${{ secrets.VITE_NETWORK_SCHEMA }}
          # Add other env vars as needed

      - name: Deploy to server
        uses: easingthemes/ssh-deploy@v2.1.5
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          REMOTE_USER: ${{ secrets.REMOTE_USER }}
          SOURCE: "dist/"
          TARGET: "/var/www/quai-vault/dist"
```

---

For more information, see the [Vite deployment documentation](https://vitejs.dev/guide/static-deploy.html).
