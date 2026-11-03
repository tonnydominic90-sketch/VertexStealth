# Payment hooks: turning a first payment into a partner commission

Both hooks call one database function, `record_partner_commission(user_id, provider, payment_id, amount_usd, currency)`.
It is safe to call more than once: it pays a partner **only for a referred customer's first payment** (one commission per
referred customer), ignores repeats of the same payment, and ignores customers nobody referred.
`amount` must be the price the customer paid **excluding tax**, in USD.

## Creem (add to your existing `creem-webhook` function)
`checkout.completed` fires once, for the first purchase (renewals arrive as `subscription.paid`, which we deliberately ignore).
`refund.created` / `dispute.created` cancel the commission (or mark it "reversed" if it was already paid).
Your `create-checkout` function already puts `user_id` in the checkout metadata, which comes back in `checkout.completed`.

```ts
// inside the handler, after the signature check and JSON.parse -> `evt`, using your service-role client `admin`
if (evt.eventType === "checkout.completed") {
  const o = evt.object, order = o?.order, uid = o?.metadata?.user_id;
  if (uid && order?.status === "paid") {
    const net = (Number(order.amount_paid) - Number(order.tax_amount ?? 0)) / 100; // after discount, before tax
    await admin.rpc("record_partner_commission", {
      p_user_id: uid, p_provider: "creem", p_payment_id: order.id, p_amount: net, p_currency: order.currency,
    });
  }
}
if (evt.eventType === "refund.created" || evt.eventType === "dispute.created") {
  const orderId = evt.object?.order?.id;
  if (orderId) await admin.rpc("cancel_partner_commission_for_payment", {
    p_provider: "creem", p_payment_id: orderId, p_reason: evt.eventType === "refund.created" ? "refunded" : "chargeback",
  });
}
```

## Binance Pay (add to your `binance-webhook` function)
Put this right after the line that extends `plan_expires_at` (so it only runs for a verified, fully paid, first-time-claimed order):

```ts
await admin.rpc("record_partner_commission", {
  p_user_id: order.user_id, p_provider: "binance", p_payment_id: data.merchantTradeNo,
  p_amount: PRICES[order.plan], p_currency: "USD",
});
```
Binance refunds are manual: use the **Commissions** tab in the partner admin page ("Cancel" / "Reverse").

## Good to know
- A referral must exist **before** the payment (the app claims the code right after sign-up), otherwise there is nothing to credit.
- Prices must be in USD. A non-USD payment is ignored by design (the function answers `unsupported_currency`).
- Commission is created as **pending** and becomes **approved** after `hold_days` (default 14), then paid in a monthly payout.
