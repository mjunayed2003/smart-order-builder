# ANSWERS

All answers below were produced by running my own code. Command (prints every answer, lines start with `Q1`, `Q2`, ...):

```bash
npx vitest run src/test/answers.test.ts --reporter=verbose
```

The test file is `src/test/answers.test.ts`. It uses the same `validate`, `priceCart`, stock and stats functions as the app, and the seed orders are priced with `buildOrder`, the same function the checkout uses. Money is shown in BDT. Server date used for Q3 and Q4 is 2026-11-26 (Asia/Dhaka).

---

## Q1. Maximum number of item C from an empty cart, and the limiting ingredient

**Answer: 2. The limiting ingredient is cheese.**

Printed: `Q1: max C = 2; limited by: [ 'cheese' ]`.

C needs 2 cheese per unit and the stock is 4, so only 2 units fit (4 / 2). Other ingredients would allow more: egg 10 / 2 = 5, tofu 5, paratha 10, baked beans 8, mushroom 6. After two C, the free stock printed is cheese 0 and egg 6.

## Q2. Cheapest valid configuration and its unit price

**Answer: Toast x1, Fried x2, Tofu x1 = 360.00 BDT.**

Printed: `Q2: cheapest = 360.00 BDT { toast: 1, fried: 2, tofu: 1 }`.

Check by hand: base 250 + Toast 0 + Fried 2 x 30 = 60 + Tofu 50 = 360. This is the minimum allowed in each group (1 bread, 2 eggs, 1 protein, 0 extras, 0 sauce) using the cheapest option in each. Fried is the cheapest egg option per unit (30) and Tofu is the cheapest protein (50). The test brute-forces every configuration and keeps only those with no violation from `validate`.

## Q3. Cart = A x3, server time 10:30, then 11:30

A = Toast, Scrambled x2, Chicken Sausage x1, Ketchup.

Step by step:

1. Unit subtotal = 250 + 0 (Toast) + 2 x 35 (Scrambled) + 60 (Sausage) + 0 (Ketchup) = **380.00**.
2. Extras deal: no extras, nothing to discount. Combo: eggs 2 (< 4) and protein 1 (< 2), so no combo. Unit price stays 380.00.
3. Line total = 380.00 x 3 = **1,140.00**. Cart subtotal = 1,140.00.

**At 10:30** (coupon MORNING15 entered):

4. C1: subtotal 1,140.00 is below 1,200.00, so C1 = 0.
5. C2: 15% of 1,140.00 = 171.00, above the 150.00 cap, so C2 = 150.00. The time is before 11:00, so it is valid.
6. Chosen discount: **C2, 150.00**. Discounted subtotal = 990.00.
7. VAT 5% of 990.00 = **49.50**. Total = 1,039.50, rounded half-up to whole BDT = **1,040**.

**At 11:30** (coupon entered):

4. C1 is still 0 (1,140.00 < 1,200.00).
5. C2 is rejected because 11:30 is not before 11:00.
6. Chosen discount: **none, 0.00**. Discounted subtotal = 1,140.00.
7. VAT 5% of 1,140.00 = **57.00**. Total = 1,197.00 = **1,197**.

Printed: `Q3 10:30 ... discount=C2 150.00 ... vat=49.50 payable=1,040.00` and `Q3 11:30 ... discount=null 0.00 ... vat=57.00 payable=1,197.00 couponRejected=true`.

## Q4. After TC-10, payable at 11:30

Cart after TC-10: B edited to Omelette x1 + Fried x3 (quantity 1), plus C x2.

- B2 unit before promos: 250 + Croissant 60 + Omelette 70 + Fried 3 x 30 = 90 + Sausage 60 + Bacon 90 + Hash Brown 40 + Mushroom 30 + Hollandaise 25 = 715. Eggs are 1 + 3 = 4 and protein is 2, so the 10% combo applies: 715 x 0.9 = **643.50** (matches TC-10).
- C unit = 490.00, x2 = 980.00.
- Subtotal = 643.50 + 980.00 = **1,623.50**.
- At 11:30 the coupon is rejected. C1 applies (1,623.50 >= 1,200): **100.00**. Discounted = 1,523.50.
- VAT 5% = 76.175, half-up to the poisha = **76.18**. Total = 1,599.68, rounded to whole BDT.

**Answer: payable = 1,600.** The printed line also shows egg remaining = 1 after the edit.

## Q5. Payable of each seed order and total revenue

| Order | Payable (BDT) |
|---|---|
| ORD-1001 | 339.00 |
| ORD-1002 | 713.00 |
| ORD-1003 | 1,271.00 |
| ORD-1004 | 578.00 |
| ORD-1005 | 866.00 |
| ORD-1006 | 1,228.00 |

**Total revenue of all six = 4,995.00 BDT.** Each order was priced at its own `createdAt` (Asia/Dhaka) with its coupon code.

## Q6. Best-selling option across the seed orders (units = line quantity x option quantity)

**Answer: Fried, 10 units.** Printed: `Q6 { units: 10, leaders: [ { id: 'fried', name: 'Fried' } ] }`. There is no tie.

## Q7. Payment method with the most revenue

**Answer: card, 2,145.00 BDT.** Printed: `Q7 { card: '2,145.00', bkash: '1,579.00', cash: '1,271.00' }`.

Card = ORD-1001 + 1004 + 1006 = 339 + 578 + 1,228 = 2,145. Bkash = 713 + 866 = 1,579. Cash = 1,271.

## Q8. Orders that actually received MORNING15

**Answer: 3 orders** (ORD-1001, ORD-1003, ORD-1005). Printed: `Q8 applied count = 3`.

Four seed orders carry the code. ORD-1002 and ORD-1004 have `couponCode: null`, so they are not counted.

| Order | Time (Dhaka) | Subtotal | Result |
|---|---|---|---|
| ORD-1001 | 20 Nov 09:15 | 380.00 | Applied, C2 = 15% = 57.00. C1 is 0 because the subtotal is below 1,200. |
| ORD-1003 | 21 Nov 10:05 | 1,360.00 | Applied, C2 = 15% = 204.00, capped to 150.00. C1 is 100.00, so C2 is larger and wins. |
| ORD-1005 | 22 Nov 08:50 | 970.00 | Applied, C2 = 15% = 145.50. C1 is 0 because 970 is below 1,200. |
| ORD-1006 | 22 Nov 13:10 | 1,169.50 | **Not applied.** The code was entered at 13:10, which is after 11:00, so the coupon is rejected (`couponRejectedReason: expired`). C1 does not apply either because 1,169.50 is below 1,200.00, so this order got no discount at all. |

Subtotals worked out: ORD-1003 = C x2 (2 x 490.00) + A (380.00) = 1,360.00. ORD-1005 = unit 485.00 (250 + Paratha 20 + Scrambled 2 x 35 + Sausage 2 x 60 + Hollandaise 25) x 2 = 970.00. ORD-1006 = B 679.50 + a croissant/fried/tofu/cheese line of 490.00 = 1,169.50.

Only ORD-1006 has the code but did not get the discount.