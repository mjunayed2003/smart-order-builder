# Smart Order Builder

A breakfast order builder with a rules engine, shared ingredient stock, a pricing engine, cart reservations, checkout with JSON orders, and a Gemini-powered sales assistant. There is no real backend: MSW is the server.

Stack: React 18, TypeScript (strict), Vite, MSW, Vitest + React Testing Library, Gemini API (free tier).

## Setup

```bash
npm install
npx msw init public/ --save     # only if public/mockServiceWorker.js is missing
cp .env.example .env.local      # then put your key in .env.local
npm run dev                     # http://localhost:5173
npm test                        # runs all tests once
npx tsc -b                      # type check
```

`.env.local`:

```
VITE_GEMINI_API_KEY=your_key
VITE_GEMINI_MODEL=<a flash model name your key can use>
```

`VITE_GEMINI_MODEL` is optional. If the bot returns a 404-type error, the model name is not available for your key. Change this variable and restart the dev server. The key is read in the browser, which the brief allows for this task, but it means the key is visible to anyone who opens the app, so use a throwaway key.

To reset the mock server to the six seed orders, run this in the browser console:

```js
localStorage.removeItem('sob-server-v1'); location.reload()
```

## Architecture

```
public/menu.json            fixture: product, groups, options, rules, stock, promos
public/orders.seed.json     six seed orders (no prices)
src/engine/                 pure functions, no React, no network, no hardcoded ids
  validate.ts               rules engine
  stock.ts                  shared ingredient stock, net difference, shortages
  pricing.ts, money.ts      integer-poisha pricing
  stats.ts                  sales statistics over orders
src/mocks/                  the "server" (MSW)
  serverState.ts            state, clock skew, reservations, order building, persistence
  handlers.ts               /api/* endpoints
src/api/client.ts           typed fetch wrapper
src/hooks.ts                useServerNow, usePrice (debounce + cancel + request id)
src/components/             Builder, Cart, Checkout, Chat
src/assistant/              tools.ts (tool declarations and runner), gemini.ts (function calling)
src/test/                   engine, stats, gemini and answers tests
```

Everything about the menu (groups, options, limits, rules, stock, promotions) comes from `/api/menu`, which serves `menu.json`. The engines only look at ids given in the data, so a different fixture should work without code changes. One interpretation I made: "eggs" for the combo promo means the sum of quantities of all options in the eggs group, and "protein" the same for the protein group. The group ids used by the promos are also in the fixture.

### Rules engine (`validate`)

`validate(config, groups, rules)` returns every violation, each with a group or rule id and a message. It checks min, max, step, maxDistinct and maxPerOption per group, then `requires` and `excludes` rules. `overrideLimit` rules are collected first and replace the group's base max, so the override wins (if several apply, the smallest is used).

### Stock engine

Stock is per ingredient. Available stock = total - sold - usage of all active (not expired) cart items. Usage of an item = option qty * ingredient use * item qty. For an edit, the item's own old allocation is excluded from "others", so it counts as available to itself, which gives the net-difference rule without any special case. `shortages` lists every missing ingredient and `shortText` prints "Short: 2 egg, 2 cheese". `remainingFor` gives the "N left" shown next to each option. Ingredients that are not in the stock list (ketchup, chili) are unlimited.

### Pricing engine

`priceCart(cart, menu, promos, serverTime, couponCode)` is pure and is used by the mock server, the UI preview, seed pricing and the tests. All values are integer poisha. Percentages use `mulDivHalfUp` (integer half-up), and only the final payable is rounded to whole BDT. Steps run in the order from the brief: unit subtotal, extras deal, combo, line totals, cart discount (larger of C1 and C2, tie goes to C1), VAT. The coupon check uses the Asia/Dhaka time of day taken from the server time.

### Mock server

- State lives in memory and is saved to `localStorage`, so orders and reservations survive a refresh. On first start the seed orders are priced with the same `buildOrder` used at checkout, at each order's `createdAt`.
- The server clock is browser time + 90 seconds. `/api/state` returns `serverTime`, and the UI computes `offset = serverTime - Date.now()` once and uses `Date.now() + offset` for every countdown and expiry check.
- Add, edit and checkout work on a `structuredClone` of the state and commit only if everything passes. There is no `await` between the checks and the commit, so concurrent requests cannot interleave and a failed request leaves no partial reservation.
- Add to cart and Pay use an `Idempotency-Key`. The server stores the response per key and returns it again for a repeated key.
- A reservation lasts 5 minutes. Expired items are marked expired on the server and their stock is no longer counted as used. Sold stock is never released.
- `/api/price` has a 200-1500 ms delay and a 15% random failure.

### UI

The preview price uses a 300 ms debounce, an `AbortController` and a request id, so an older response can never replace a newer one. On failure the configuration is kept and a Retry button is shown. Buttons are disabled while a request is in flight and a ref blocks fast repeated clicks. See DECISIONS.md for D1-D6.

### Sales assistant

The model never calculates. The first Gemini call uses function calling in mode ANY, so the model must pick one of the tools in `src/assistant/tools.ts`. My code then fetches fresh orders from `/api/orders` and runs the tool (pure functions in `stats.ts`). A second call lets the model phrase the result in one or two sentences. For `cannot_answer` the code returns a fixed text and the model is not called again. Tools: `get_order_count`, `get_total_revenue`, `get_best_selling_option`, `get_revenue_by_payment_method`, `get_average_order_value`, `get_coupon_applied_count`, `get_orders_on_date`, `cannot_answer`. Missing key, invalid key, quota (429) and network errors each have their own message. A busy model (503) is retried up to two times before an error is shown.

## Tests

`npm test` runs Vitest. Covered: TC-01 to TC-11 (rules, pricing, stock) in `engine.test.ts`; the stats functions against the seed data, the tool runner, and the Gemini flow with a mocked `fetch` (TC-18, TC-20, error kinds) in `stats.test.ts` and `gemini.test.ts`. `answers.test.ts` prints the answers used in ANSWERS.md:

```bash
npx vitest run src/test/answers.test.ts --reporter=verbose
```

## Trade-offs

- Orders and reservations are stored in `localStorage` as the mock server's database. Simple and survives refresh, but it is per browser and not shared between machines.
- The Gemini key is in the browser bundle, as allowed by the brief. Not safe for production.
- Free-tier Gemini can return 503 or 429. I retry 503 only, because 429 is a quota message that the brief wants shown separately.
- Editing an item does not renew its 5-minute reservation.
- The UI is plain on purpose, since the task is about logic.

## Unfinished

- Part G (bonus) is not done: refresh already keeps only valid reservations because the server is the source of truth, but there are no version numbers or conflict handling between tabs, and an unfinished configuration is lost on refresh.
- Automated component tests (RTL) for TC-12 (out-of-order price responses), TC-13 (triple click), TC-14 (failed reserve), TC-15 (expiry) and TC-16 (double Pay) are not written. I checked these by hand in the browser (see the notes in DECISIONS.md for the behaviour). `TC-17` was also checked by hand: refresh, then Download orders.json.
- TC-19 depends on the data, and I checked it by comparing the bot's answer with `bestSellingOption` in the tests.

## Time spent

<fill in your real hours here, for example: engine 3h, mock server 3h, UI 3h, assistant 2h, docs 1h = 12h>