# forza.plus

Static site for Forza, deployed from GitHub to Render.

## Project structure

- `index.html` - Homepage
- `watch.html` - Watch page
- `posts.html` - Posts page (X profile + timeline)
- `donate.html` - Donation page (PayPal.Me support)
- `accounts.html` - Accounts page (dynamic API-backed account status)
- `style.css` - Shared styles
- `script.js` - Homepage JS
- `accounts.js` - Accounts page API integration script
- `watch.js` - Watch page JS
- `Branding/` - Image assets (`logo.png`, `background.png`, `background-mobile.png`)
- `render.yaml` - Render Blueprint config

## Local development

No build step is required.

Use any static file server from the repo root, for example:

```powershell
python -m http.server 8080
```

Then open:

- `http://localhost:8080/`
- `http://localhost:8080/watch.html`
- `http://localhost:8080/posts.html`
- `http://localhost:8080/donate.html`
- `http://localhost:8080/accounts.html`

## Git workflow

```powershell
git add .
git commit -m "Describe your change"
git push
```

Every push to `main` triggers a Render deploy.

## Render deployment

1. In Render, create a new **Blueprint** service.
2. Connect this GitHub repo.
3. Render will read `render.yaml` and create a static site.
4. Keep auto-deploy enabled for `main`.

`render.yaml` publishes the repo root (`./`) and skips dependency installation for a low-friction static workflow.
