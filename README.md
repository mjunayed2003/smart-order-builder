# Smart Order Builder

A breakfast order builder with a rules engine, shared ingredient stock, a pricing engine, cart reservations, checkout with JSON orders, and a Gemini-powered sales assistant. There is no real backend: MSW acts as the server.

Stack: React 18, TypeScript (strict), Vite, MSW, Vitest + React Testing Library, Gemini API (free tier).

Other documents: [DECISIONS.md](./DECISIONS.md) (decisions D1-D6, checkpoints C1-C2) and [ANSWERS.md](./ANSWERS.md) (Q1-Q8, produced by running the code).

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
GEMINI_API_KEY=your_key
GEMINI_MODEL=<a flash model name your key can use>
```

`GEMINI_MODEL` is optional, the code has a default. If the bot shows a model-not-found error (404), that model name is not available for your key: set this variable to a Flash model listed in your Google AI Studio and restart the dev server (Vite reads `.env.local` only at start).

The key is read in the browser, which the brief allows for this task. It means anyone who opens the app can see the key, so use a throwaway key.

To reset the mock server back to the six seed orders, run this in the browser console:

```js
localStorage.removeItem('sob-server-v1'); location.reload()
```

## Project structure

```
public/menu.json            fixture: product, groups, options, rules, stock, promos
public/orders.seed.json     six seed orders (no prices)
src/engine/                 pure functions: no React, no network, no hardcoded ids
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
src/assistant/              tools.ts (tool declarations + runner), gemini.ts (function calling)
src/test/                   engine, server, ui, stats, gemini and answers tests
```

## Architecture

Everything about the menu (groups, options, limits, rules, stock, promotions) comes from `GET /api/menu`, which serves `menu.json`. The engines only use ids that are given in the data, so a different fixture should work without code changes.

One interpretation I made: for the combo promo, "eggs" is the sum of quantities of all options in the eggs group and "protein" the same for the protein group. The group ids the promos refer to are also in the fixture.

### Rules engine (`validate`)

`validate(config, groups, rules)` returns every violation, each with a group or rule id and a readable message, not only the first one. It checks min, max, step, maxDistinct and maxPerOption for each group, then the `requires` and `excludes` rules. `overrideLimit` rules are collected first and replace the base max of their group, so the override wins (if several apply, the smallest limit is used). The Add to Cart button stays disabled while any violation exists.

### Stock engine

Stock is per ingredient and shared by the whole cart and the configuration being built.

- Available stock = total - sold - usage of all active (not expired) cart items.
- Usage of an item = option quantity x ingredient use x item quantity.
- For an edit, the item's own old allocation is left out of "others", so it counts as available to itself. This gives the net-difference rule without a special case, and nothing is double-counted or over-released.
- `shortages` lists every missing ingredient and `shortText` prints it as "Short: 2 egg, 2 cheese".
- `remainingFor` gives the "N left" shown next to each option, and the option is disabled at 0.
- Ingredients that have no stock entry (Ketchup, Chili) are unlimited.

### Pricing engine

`priceCart(cart, menu, promos, serverTime, couponCode)` is a pure function used by the mock server, the UI preview, the seed-order pricing and the tests. All values are integer poisha. Percentages use `mulDivHalfUp` (integer half-up) and only the final payable is rounded to whole BDT. The steps run in the order from the brief: unit subtotal, extras deal, combo, line totals, one cart discount (the larger of C1 and C2, a tie goes to C1), then VAT on the discounted subtotal. The coupon check takes the Asia/Dhaka time of day from the server time passed in.

### Mock server

- The state is kept in memory and saved to `localStorage`, so orders and reservations survive a refresh. On first start the seed orders are priced by `buildOrder`, the same function used at checkout, at each order's own `createdAt`.
- The server clock is browser time + 90 seconds. `/api/state` returns `serverTime`. The UI computes `offset = serverTime - Date.now()` and uses `Date.now() + offset` for every countdown and expiry check.
- Add, edit and checkout work on a `structuredClone` of the state and commit only when everything passes. There is no `await` between the checks and the commit, so concurrent requests cannot interleave and a failed request leaves no partial reservation.
- Add to cart and Pay use an `Idempotency-Key`. The server stores the response for each key and returns the same response for a repeated key.
- A reservation lasts 5 minutes. Expired items are marked as expired and their stock is no longer counted as used. Sold stock is never released.
- Edit is one call that swaps the old allocation for the new one. It does not renew the 5 minutes.
- `/api/price` has a 200-1500 ms delay and a 15% random failure.

### UI

- Builder: per-option "N left", violations list, shortage text, quantity 1-3, and a price preview.
- Price preview: 300 ms debounce, an `AbortController` and a request id, so an older response cannot replace a newer one. On failure the configuration is kept and a Retry button is shown.
- Add to Cart and Pay: the button is disabled while the request is running, a ref blocks fast repeated clicks, and an idempotency key is created once per attempt (kept for Retry, renewed after success).
- Cart: countdown from server time, expired items become read-only and can only be removed.
- Checkout: payment method label, coupon input, full breakdown (subtotal, discount, VAT, payable), and a Download orders.json button.

### Sales assistant

The model never calculates. The first Gemini call uses function calling in mode ANY, so the model must pick one of the tools in `src/assistant/tools.ts`. My code then fetches fresh orders from `/api/orders` and runs the tool (pure functions in `stats.ts`). A second call lets the model phrase the result in one or two sentences. For `cannot_answer` (for example "Who is our best customer?") the code returns a fixed message and the model is not called again, so a name cannot be invented.

Tools: `get_order_count`, `get_total_revenue`, `get_best_selling_option`, `get_revenue_by_payment_method`, `get_average_order_value`, `get_coupon_applied_count`, `get_orders_on_date`, `cannot_answer`.

Errors: a missing key, an invalid key, a quota error (429) and a network error each show their own message. A busy model (503) is retried up to two times before an error is shown.

## Tests

`npm test` runs everything with Vitest (6 files, 38 tests).

| File | Covers |
|---|---|
| `engine.test.ts` | TC-01 to TC-11: rules, pricing, stock and edits |
| `server.test.ts` | TC-13, TC-14, TC-15, TC-16 against the real MSW handlers (idempotency, no phantom reservation, server-time expiry, double Pay) |
| `ui.test.tsx` | TC-12 (out-of-order price responses), TC-13 (triple click), TC-14 (failed add keeps the configuration, Retry reuses the key) |
| `stats.test.ts` | stats functions on the seed data, the tool runner |
| `gemini.test.ts` | Gemini flow with a mocked `fetch`: TC-18, TC-20, error kinds |
| `answers.test.ts` | prints the answers used in ANSWERS.md |

To print the answers for ANSWERS.md:

```bash
npx vitest run src/test/answers.test.ts --reporter=verbose
```

TC-17 (refresh, then Download orders.json) and TC-19 (bot answer changes with the data) were checked by hand in the browser. They have no automated test, except that the stats function behind TC-19 is tested.

## Trade-offs

- Orders and reservations are saved in `localStorage` as the mock server's database. It is simple and survives a refresh, but it is per browser and not shared between machines.
- The Gemini key is in the browser, as the brief allows. This would not be safe in production.
- The free Gemini tier can answer 503 or 429. I retry 503 only, because 429 is a quota message that the brief wants shown separately.
- Editing an item does not renew its 5-minute reservation, so editing cannot be used to hold stock forever.
- The final price is locked at checkout, so the total shown in the cart can change at Pay (see D2 in DECISIONS.md).
- The UI is plain on purpose, since the task is about logic.


## Time spent

<fill hours here : engine 2.5h, mock server 2.5h, UI 2h, assistant 2h, tests 1h, docs 1h = 11h>