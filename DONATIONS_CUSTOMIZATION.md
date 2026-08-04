# Customizing Donation Info

Your UPI ID and QR code are currently set throughout the app. Here's where to change them:

## UPI ID: `7010587974@kotakbank`

### Replace in 2 places:

**1. Dashboard donation card** — `js/modules/dashboard/dashboard.js` (line ~54)
```javascript
UPI: <strong>7010587974@kotakbank</strong>
```

**2. PDF Toolkit donation modal** — `tools/pdf-toolkit/index.html` (line ~900)
```html
UPI ID: <strong>7010587974@kotakbank</strong>
```

**3. PDF Toolkit app.js alert** — `tools/pdf-toolkit/app.js` (line ~460)
```javascript
alert(`To donate ₹${amount}, scan the QR code or use UPI ID: 7010587974@kotakbank...
```

**4. Dashboard donation button alert** — `js/modules/dashboard/dashboard.js` (line ~41)
```javascript
alert(`To donate ₹${amount}, scan the QR code below or use:\n\nUPI: 7010587974@kotakbank...
```

---

## QR Code: `qr.png`

The QR code file is embedded in the PDF Toolkit:
- **Path**: `tools/pdf-toolkit/qr.png`
- **Used in**: `tools/pdf-toolkit/index.html` and dashboard (for the donation modal)

### To replace:
1. Generate a new UPI QR code for your ID (use: [upi.google](https://myqr.app/) or your bank's generator)
2. Export as PNG (160×160px is ideal)
3. Replace `tools/pdf-toolkit/qr.png` with your new QR
4. Test scanning in your PDF Toolkit

---

## Donation Amounts

The quick-tip buttons are in `tools/pdf-toolkit/index.html` (lines ~893–896):
```html
<button class="donate-btn" data-amount="50">₹50</button>
<button class="donate-btn" data-amount="100">₹100</button>
<button class="donate-btn" data-amount="500">₹500</button>
<button class="donate-btn" data-amount="1000">₹1000</button>
```

Change the values (50, 100, 500, 1000) to whatever makes sense for your audience.

---

## Optional: Connect to a Real Payment Gateway

Currently, clicking donate shows an alert. To integrate with a real payment processor:

### Razorpay (recommended for UPI + credit card)
```javascript
// In dashboard.js donation button handler
const options = {
  key: 'YOUR_RAZORPAY_KEY_ID',
  amount: parseFloat(amountInput.value) * 100, // in paise
  currency: 'INR',
  description: 'Support Productivity Hub development',
  handler: (response) => {
    toastSuccess('Thank you for your support! 💚', response.razorpay_payment_id);
  }
};
const rzp = new Razorpay(options);
rzp.open();
```

Add Razorpay script to `index.html`:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

### Direct UPI Payment (simpler, zero fees)
Keep the current alert-based flow — users scan and send directly. No integration needed, no fees.

---

## Testing

After customization:
1. `git add .`
2. `git commit -m "Update donation details"`
3. `git push` — Cloudflare auto-deploys
4. Test the donation cards in both Dashboard and PDF Toolkit
5. Verify QR code scans correctly

Done! 💚
