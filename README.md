# Game template

Skeleton for new multi-device web games in this directory. See
`../CLAUDE.md` for the full setup contract — this template implements it.

## Use

```sh
cp -r _template/ my-game/
cd my-game
cp .env.example .env   # then fill in Firebase values
npm install
npm run dev
```

Then update:
- `name` in `package.json`
- `<title>` and `<meta name="description">` in `index.html`
- `home.title` and `home.subtitle` in `src/locales/en.json`
- the MUI theme in `src/theme/theme.ts`

The page stubs (`src/pages/*.tsx`) are intentionally minimal — they render
enough to verify routing works, with `// TODO` comments where game logic
should be wired against `react-gameroom`.
