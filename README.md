# 📒 Hisab-Kitab — Nepali Business Cash Tracker

Free, bilingual (English + नेपाली) cash tracker for Nepali small businesses.

## Features
- ✅ Cash in/out ledger with categories
- ✅ Date filters (Today / Week / Month / All)
- ✅ 7-day income vs expense chart
- ✅ Top expense category breakdown
- ✅ VAT bill generator (13% Nepal VAT, PAN-ready)
- ✅ WhatsApp report & bill sharing
- ✅ AI business advisor (powered by Claude)
- ✅ Works offline (localStorage)
- ✅ Dark mode support
- ✅ Mobile-first design

---

## 🚀 Deploy to Vercel (FREE — 10 minutes)

### Step 1 — Get your Anthropic API key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up for free
3. Go to **API Keys** → click **Create Key**
4. Copy the key (starts with `sk-ant-...`)

### Step 2 — Add your API key to the app
Open `index.html` and find this line near the bottom:
```js
const ANTHROPIC_KEY = 'YOUR_API_KEY_HERE';
```
Replace `YOUR_API_KEY_HERE` with your actual key.

### Step 3 — Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) → Sign up free with GitHub
2. Click **Add New Project**
3. Upload this folder (drag & drop the `hisab-kitab` folder)
4. Click **Deploy**
5. Done! You get a live URL like `hisab-kitab.vercel.app`

### Optional: Custom domain
In Vercel dashboard → your project → **Settings** → **Domains**  
Add a domain like `hisabkitab.com.np` (costs ~$10/year)

---

## 📱 Share it
Once deployed, share the URL via WhatsApp to local shop owners.  
Works on any phone browser — no app download needed.

---

## 🔒 Note on API key
The API key is currently in the frontend code. This is fine for a personal/MVP app, but for a production launch with many users you should:
1. Move to a backend proxy (Vercel serverless function)
2. Or use Anthropic's usage limits to cap spend

---

## Tech stack
- Pure HTML/CSS/JS — no framework, no build step
- Vercel for hosting (free)
- Anthropic Claude API for AI advisor
- localStorage for data persistence

Built with ❤️ for Nepal's small businesses.
