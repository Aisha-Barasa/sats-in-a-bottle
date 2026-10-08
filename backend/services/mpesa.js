// Stub for Safaricom Daraja integration.
// Replace the mocked functions below with real Daraja API calls:
// https://developer.safaricom.co.ke/APIs
//
// Flow for real integration:
//  1. POST /oauth/v1/generate to get an access token (consumer key/secret)
//  2. POST /mpesa/stkpush/v1/processrequest to trigger the prompt on the
//     payer's phone (inbound funding of a bottle)
//  3. Safaricom calls DARAJA_CALLBACK_URL with the result — verify and
//     update the bottle's status there (see routes/bottles.js)
//  4. POST /mpesa/b2c/v1/paymentrequest to pay out to the recipient when
//     they claim an opened bottle

async function initiateStkPush({ phone, amountKes, accountRef }) {
  // TODO: real Daraja STK push call
  console.log(`[mpesa:mock] STK push to ${phone} for KES ${amountKes} (${accountRef})`);
  return {
    merchantRequestId: "mock-" + Date.now(),
    checkoutRequestId: "mock-checkout-" + Date.now(),
    responseCode: "0",
    responseDescription: "Success. Request accepted for processing"
  };
}

async function payoutToRecipient({ phone, amountKes, remarks }) {
  // TODO: real Daraja B2C payout call
  console.log(`[mpesa:mock] B2C payout of KES ${amountKes} to ${phone} (${remarks})`);
  return {
    conversationId: "mock-conv-" + Date.now(),
    responseCode: "0",
    responseDescription: "Accept the service request successfully."
  };
}

module.exports = { initiateStkPush, payoutToRecipient };
