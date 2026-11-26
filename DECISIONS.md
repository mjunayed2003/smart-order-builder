# DECISIONS

All money in this project is stored as integer poisha (1 BDT = 100 poisha). Everything below describes what the code actually does.

---

## C1. Why a float is risky for TC-06, and how the VAT 75.48 is rounded

679.50 on its own is safe, because .5 is exactly representable in binary. The risk is in how we get to it and what we do next. A value like 755 * 0.9 or 1509.50 * 0.05 goes through binary fractions that cannot be stored exactly, so a result can come out as 679.5000000000001 or 75.47499999999999. TC-06 is dangerous because the VAT lands exactly on a half-poisha, and a tiny float error flips the half-up rounding to the wrong side.

By hand: subtotal is 1,659.50. C2 would be 15% = 248.925, which is above the 150 cap, so C2 = 150.00 and it beats C1 (100). Discounted subtotal = 1,509.50 = 150,950 poisha. VAT 5% = 150,950 * 5 / 100 = 7,547.5 poisha. This is exactly a half, so half-up gives 7,548 poisha = 75.48. Payable = 150,950 + 7,548 = 158,498 poisha = 1,584.98, rounded half-up to whole BDT = 1,585.

In code, `mulDivHalfUp(amount, num, den)` does `floor((2*amount*num + den) / (2*den))` using only integers, so there is no float step anywhere.

---

## C2. Questions the bot supports and the function behind each

The model only picks a tool. My code runs it over the orders fetched fresh from `/api/orders` and the model only phrases the returned result.

| Question | Tool | Input | Output | Stats function |
|---|---|---|---|---|
| How many orders | `get_order_count` | none | `{count, summary}` | `orderCount` |
| Total revenue | `get_total_revenue` | none | `{revenueBdt, summary}` | `totalRevenue` |
| Best-selling option | `get_best_selling_option` | none | `{units, options[], summary}` (ties are all listed) | `bestSellingOption` |
| Revenue by payment method | `get_revenue_by_payment_method` | none | `{revenueBdtByMethod, summary}` | `revenueByPayment` |
| Average order value | `get_average_order_value` | none | `{averageBdt, summary}` | `averageOrderValue` |
| Orders that really got the coupon | `get_coupon_applied_count` | none | `{count, summary}` | `couponAppliedCount` |
| Orders on a date | `get_orders_on_date` | `date` as YYYY-MM-DD (Asia/Dhaka) | `{date, count, orderIds, summary}` | `ordersOnDate` |
| Anything else (customers, profit, stock...) | `cannot_answer` | `reason` | fixed text from code | none |

Units for best-seller are `line.qty * option qty`. A bad or missing date returns an `invalid_date` error instead of a guess.

---

## D1. Two tabs, tab A saves after tab B took the last eggs

When tab A saves, the server recalculates the stock for that item with the item's own old allocation excluded, and sees the eggs are gone. It answers 409 with the exact shortage, for example "Short: 1 egg", and changes nothing, so the old allocation of the item stays intact. The edit form lives in React state and is never reset on an error, so the user keeps everything they typed. After the failed save the app refreshes the server state, so the "N left" numbers update, and the user can lower the eggs and press Save again. I chose not to merge or overwrite anything silently. The bonus version-number conflict handling (Part G) is not implemented.

---

## D2. When is the price locked

I lock the price at checkout, not at Add to Cart and not never. The coupon depends on server time (before 11:00 Asia/Dhaka), so a price that was fixed when the item was added could give a morning discount to someone paying at noon. In the cart and checkout panel the price is only a preview, and when Pay is pressed the server recalculates with its own clock, stores the totals in the order, and that stored number is the final one. This matches TC-06 and TC-07: the same cart gives 1,585 at 10:59:59 and 1,637 at 11:00:00, and the only input that changed is the server time. Seed orders are priced the same way, at their own `createdAt`. The downside is that the displayed total can change between the cart and Pay, which is why the UI says the final price is calculated by the server.

---

## D3. Reservation expires while the user is editing

The user's unsaved changes stay on screen, nothing is thrown away. The Save button is disabled and a yellow banner says the reservation expired, the changes are kept, and that saving is off. A separate "Add as new item" button lets the user reserve the same configuration again as a new cart item with a new idempotency key, if stock still allows it. The server also refuses an edit of an expired item with 409, so this is not only a UI rule. Editing does not renew the 5 minutes: `expiresAt` stays the same, because I did not want edits to be a way to hold stock forever.

---

## D4. Who creates the order id and timestamp, and double-click on Pay

The server does. The browser clock is 90 seconds behind the server and the coupon cut-off uses server time, so the order time must come from the server's clock. The id is generated on the server as max existing number + 1 (ORD-1007 after the six seed orders). For double clicks there are two layers: an `inFlight` ref blocks a second call while one is running, and every Pay attempt sends an `Idempotency-Key` (kept in a ref, so it is created once per attempt, not once per click). The server stores the response under that key, so a repeated key returns the same order and never creates a second one. After a successful payment the key is renewed. After a failed one it is kept, so Retry is safe.

---

## D5. "Who is our best customer?"

Orders have no customer field, so the honest answer is that it cannot be known from this data. The first model call uses function calling mode ANY, so the model cannot answer in free text and must pick a tool, and the system prompt tells it to use `cannot_answer` for anything outside the data. When it does, my code returns a fixed message and the model is not asked to phrase it. This way it cannot make up a name, because no model-written text is shown for that case. A unit test checks that only one model call is made and the fixed text comes back (TC-20).

---

## D6. Shape of a stored order

```json
{
  "id": "ORD-1001",
  "createdAt": "2026-11-20T09:15:00+06:00",
  "paymentMethod": "card",
  "couponEntered": "MORNING15",
  "couponApplied": true,
  "couponRejectedReason": null,
  "lines": [
    { "qty": 1, "options": { "toast": 1, "scrambled": 2, "sausage": 1, "ketchup": 1 },
      "unitPrice": 38000, "total": 38000 }
  ],
  "totals": {
    "subtotal": 38000,
    "discountType": "C2",
    "discount": 5700,
    "discounted": 32300,
    "vat": 1615,
    "payable": 33900
  },
  "currencyUnit": "poisha"
}
```

Money is always integer poisha (`currencyUnit` says so). `createdAt` is an ISO string with the +06:00 offset. A coupon that was typed but not used is recorded with `couponEntered` set, `couponApplied: false` and a `couponRejectedReason` of `invalid_code`, `expired` (after 11:00) or `not_better` (the code was valid but C1 was equal or bigger). Keeping "entered" and "applied" separate is what lets the bot answer "how many orders actually got the coupon" correctly. The downloaded file wraps the orders as `{ schemaVersion, currency, currencyUnit, orders: [...] }`.