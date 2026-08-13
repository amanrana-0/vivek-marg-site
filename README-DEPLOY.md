# Deploying Vivek Marg with a working "Ask Swamiji" chatbot

This package makes Ask Swamiji actually answer questions — grounded strictly
in the Complete Works of Swami Vivekananda (never a generic AI response).

## How it stays grounded (not a "random" chatbot)

1. The full Complete Works PDF was split, in advance, into **2,646 page-level
   excerpts**, each tagged with its page number, volume, and section title
   (`netlify/functions/data/cw_chunks.json`).
2. When a question comes in, `netlify/functions/ask-swamiji.js` scores every
   excerpt against the question using keyword/TF‑IDF matching (plain
   JavaScript, no external search service) and picks the ~6 most relevant.
3. **Only those excerpts** are given to Claude, with a system prompt that
   instructs it to answer using *only* that material, to say plainly when
   the excerpts don't cover the question, and to never invent a quote or
   incident.
4. The reply shown on the site includes a **Sources** line (volume / title /
   page number) for each answer, so it's checkable.

This is a form of retrieval-augmented generation (RAG) — the honest way to
make a chatbot "stick to a source," since no AI model can be forced to only
know one book; instead, we only ever show it the relevant pages of that book.

## What's in this folder

```
index.html                        ← the whole front-end (self-contained)
netlify.toml                       ← routes /api/ask to the function below
netlify/
  functions/
    ask-swamiji.js                 ← retrieval + Claude call
    data/
      cw_chunks.json               ← the indexed Complete Works (~8 MB)
```

## Deploy steps

**Important:** this needs a *function*, so plain drag-and-drop of a single
HTML file onto app.netlify.com/drop will NOT run the chatbot backend (it'll
serve the site, but Ask Swamiji will show a "couldn't be reached" message).
Use one of the two methods below instead.

### Option A — Netlify CLI (fastest, no Git needed)

1. Install the CLI once: `npm install -g netlify-cli`
2. From inside this folder: `netlify deploy` (first time, follow the prompts
   to create/link a site), then `netlify deploy --prod` when you're happy.
3. In the Netlify dashboard for your site: **Site settings → Environment
   variables → Add a variable**
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from the Claude Console (console.anthropic.com) — keep
     this secret, never put it in the front-end code
4. Redeploy (`netlify deploy --prod`) so the function picks up the new
   environment variable.

### Option B — Connect a Git repository (best for ongoing edits)

1. Push this folder to a new GitHub/GitLab repo.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Build settings: leave the build command empty and set the publish
   directory to `.` (root) — there's no build step, it's static + functions.
4. Add the `ANTHROPIC_API_KEY` environment variable as in Option A, step 3.
5. Deploy. Every future push updates the live site automatically.

## Testing it

Once deployed, open the site, go to **Ask Swamiji & Resources**, and ask a
question. You should see a reply followed by a small **Sources** line citing
the volume/title/page it was drawn from. If you see an error message
instead, check:

- Is `ANTHROPIC_API_KEY` set in Netlify's environment variables?
- Did you redeploy *after* adding it?
- Check **Site → Functions → ask-swamiji → Function log** in the Netlify
  dashboard for the exact error.

## Notes

- Model used: `claude-haiku-4-5-20251001` — fast and inexpensive, a good fit
  for a Q&A bot like this. You can change `MODEL` at the top of
  `ask-swamiji.js` to a different Claude model if you'd like a different
  quality/cost/speed balance.
- The registration form on the Vivek Marg page is still front-end only
  (it shows a success message but doesn't store submissions). Netlify Forms
  can be wired up for that next, if you'd like.
- No user data is stored by this function — each request is stateless.
