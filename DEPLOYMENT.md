# Deployment

## Vercel

Deploy the repository root. Vercel detects the functions under `api/` automatically. In Project Settings, add the `ADMIN_PINS` environment variable for the Production environment. Set it to a newly generated random value of up to 30 characters; multiple values can be comma-separated. Do not reuse the PINs that were previously present in `script.js`.

## Netlify

Deploy the repository root. `netlify.toml` configures the static publish directory, serverless functions, and `/api/*` routes. Add `ADMIN_PINS` in Site configuration > Environment variables and make it available to Functions.

Regenerate the deployment after setting the variable. The admin verification endpoint deliberately returns `503` when it is missing. Apply provider-level rate limiting or firewall rules to `/api/verify-admin` where available.

Both hosts serve static assets over their CDN with automatic Brotli/Gzip compression. Wheel data is CDN-cached for 2 seconds; player and stats data retain a 30-second cache with stale-while-revalidate. The browser requests wheel state every 3 seconds only while the wheel view is active and pauses polling in a hidden tab.

The old PINs were present in client JavaScript and may remain in repository history or prior deployments; rotating them is required. The current admin-only wheel controls are client-side demo behavior and do not mutate protected server data. Any future administrative write operation must enforce authorization in its server-side function, not in browser code.
